import { useState, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { api } from "@/api/client";
import { uploadPublicAudio, uploadPrivateAudio } from "@/api/storage";
import { ensureMicrophonePermission } from "@/lib/microphonePermissions";
import { forceStopBackgroundAudio } from "@/lib/backgroundAudio";

const CHUNK_MS = 1000;

function isUploadPermissionError(err) {
  const code = err?.code || "";
  const message = err?.message || "";
  return (
    code === "storage/unauthorized"
    || code.includes("permission")
    || /unauthorized|permission/i.test(message)
  );
}

function getSupportedMime() {
  const isAndroid = Capacitor.getPlatform() === "android";
  const types = isAndroid
    ? ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/3gpp"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function createMediaRecorder(stream, mimeType) {
  try {
    return mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
  } catch (err) {
    console.warn("MediaRecorder init failed, retrying without mimeType:", mimeType, err);
    return new MediaRecorder(stream);
  }
}

function shouldUseSingleRecorder() {
  return Capacitor.isNativePlatform();
}

async function stopMediaRecorder(recorder) {
  if (!recorder || recorder.state === "inactive") return;
  if (recorder.state === "recording") {
    try {
      recorder.requestData();
    } catch {
      // Some browsers reject requestData on certain recorder states.
    }
  }
  await new Promise((resolve) => {
    recorder.addEventListener("stop", resolve, { once: true });
    recorder.stop();
  });
}

/**
 * Half-duplex relay broadcast hook.
 *
 * Uses two recorders on the same mic stream:
 * - Relay recorder (timeslice) for live chunk playback
 * - Full recorder (single blob on stop) for chat voice messages
 */
export default function useRelayBroadcast({ channelId, userId, userName }) {
  const [isRecording, setIsRecording] = useState(false);

  const paramsRef = useRef({ channelId, userId, userName });
  paramsRef.current = { channelId, userId, userName };

  const streamRef = useRef(null);
  const ownsStreamRef = useRef(true);
  const archiveOnlyRef = useRef(false);
  const relayRecorderRef = useRef(null);
  const fullRecorderRef = useRef(null);
  const fullChunksRef = useRef([]);
  const mimeRef = useRef("audio/webm");
  const broadcastIdRef = useRef(null);
  const sequenceRef = useRef(0);
  const startTimeRef = useRef(0);
  const activeRef = useRef(false);
  const isStoppingRef = useRef(false);
  const initSegmentRef = useRef(null);
  const pendingUploadsRef = useRef([]);
  const heardBroadcastsRef = useRef(new Set());

  const uploadChunk = useCallback(async (blob, seq, isFinal) => {
    const { channelId, userId, userName } = paramsRef.current;
    if (!channelId || !userId || !blob || blob.size === 0) return;

    const file = new File([blob], "chunk.webm", { type: blob.type || mimeRef.current });
    const { file_url } = await uploadPublicAudio(
      file,
      `${channelId}/chunks/${broadcastIdRef.current}/${seq}.webm`
    );
    await api.entities.AudioChunk.createChunk({
      broadcast_id: broadcastIdRef.current,
      channel_id: channelId,
      sender_id: userId,
      sender_name: userName || "",
      sequence: seq,
      audio_url: file_url,
      is_final: isFinal,
    });
  }, []);

  const queueChunkUpload = useCallback((blob, isFinal) => {
    const seq = sequenceRef.current;
    sequenceRef.current += 1;
    const uploadP = uploadChunk(blob, seq, isFinal).catch((err) => {
      console.error("Relay chunk upload failed:", err);
    });
    pendingUploadsRef.current.push(uploadP);
    return uploadP;
  }, [uploadChunk]);

  const startRecording = useCallback(async ({
    sharedStream = null,
    archiveOnly = false,
    broadcastId = null,
    ownsStream = null,
  } = {}) => {
    const { channelId, userId } = paramsRef.current;
    if (!channelId || !userId) return false;
    if (activeRef.current) return true;

    archiveOnlyRef.current = archiveOnly;
    ownsStreamRef.current = ownsStream ?? !sharedStream;

    if (Capacitor.isNativePlatform()) {
      await forceStopBackgroundAudio();
    }

    if (sharedStream) {
      streamRef.current = sharedStream;
      startTimeRef.current = Date.now();
    } else {
      try {
        if (Capacitor.isNativePlatform()) {
          const permitted = await ensureMicrophonePermission();
          if (!permitted) return false;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        streamRef.current = stream;
        startTimeRef.current = Date.now();
      } catch (err) {
        console.error("Microphone access denied:", err);
        return false;
      }
    }

    broadcastIdRef.current = broadcastId || crypto.randomUUID();
    heardBroadcastsRef.current.add(broadcastIdRef.current);
    sequenceRef.current = 0;
    fullChunksRef.current = [];
    initSegmentRef.current = null;
    pendingUploadsRef.current = [];
    activeRef.current = true;

    const mimeType = getSupportedMime();
    mimeRef.current = mimeType || "audio/webm";
    const useSingleRecorder = shouldUseSingleRecorder();

    const appendArchiveChunk = (event) => {
      if (event.data?.size > 0) {
        fullChunksRef.current.push(event.data);
      }
    };

    const appendRelayChunk = (event, isFinalChunk) => {
      if (!event.data || event.data.size === 0) return;
      if (archiveOnlyRef.current) return;

      let uploadBlob;
      if (!initSegmentRef.current) {
        initSegmentRef.current = event.data;
        uploadBlob = event.data;
      } else {
        uploadBlob = new Blob([initSegmentRef.current, event.data], { type: mimeRef.current });
      }
      queueChunkUpload(uploadBlob, isFinalChunk);
    };

    if (useSingleRecorder) {
      const recorder = createMediaRecorder(streamRef.current, mimeType);
      recorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);
      };
      recorder.ondataavailable = (event) => {
        appendArchiveChunk(event);
        appendRelayChunk(event, isStoppingRef.current);
      };
      relayRecorderRef.current = recorder;
      fullRecorderRef.current = null;
    } else if (!archiveOnly) {
      const relayRecorder = createMediaRecorder(streamRef.current, mimeType);
      relayRecorder.onerror = (event) => {
        console.error("Relay MediaRecorder error:", event);
      };
      relayRecorder.ondataavailable = (event) => {
        appendRelayChunk(event, isStoppingRef.current);
      };
      relayRecorderRef.current = relayRecorder;

      const fullRecorder = createMediaRecorder(streamRef.current, mimeType);
      fullRecorder.onerror = (event) => {
        console.error("Archive MediaRecorder error:", event);
      };
      fullRecorder.ondataavailable = appendArchiveChunk;
      fullRecorderRef.current = fullRecorder;
    } else {
      const fullRecorder = createMediaRecorder(streamRef.current, mimeType);
      fullRecorder.onerror = (event) => {
        console.error("Archive MediaRecorder error:", event);
      };
      fullRecorder.ondataavailable = appendArchiveChunk;
      fullRecorderRef.current = fullRecorder;
    }

    try {
      if (useSingleRecorder) {
        relayRecorderRef.current.start(CHUNK_MS);
      } else if (!archiveOnly) {
        relayRecorderRef.current.start(CHUNK_MS);
        fullRecorderRef.current.start(sharedStream ? CHUNK_MS : undefined);
      } else {
        fullRecorderRef.current.start(CHUNK_MS);
      }
    } catch (err) {
      console.error("MediaRecorder.start failed:", err);
      activeRef.current = false;
      relayRecorderRef.current = null;
      fullRecorderRef.current = null;
      if (streamRef.current && ownsStreamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      streamRef.current = null;
      return false;
    }

    setIsRecording(true);
    return true;
  }, [queueChunkUpload]);

  const stopLiveRelay = useCallback(async () => {
    if (!relayRecorderRef.current) return;
    if (relayRecorderRef.current.state === "recording") {
      isStoppingRef.current = true;
    }
    await stopMediaRecorder(relayRecorderRef.current);
    isStoppingRef.current = false;
    relayRecorderRef.current = null;
  }, []);

  const stopRecording = useCallback(async () => {
    if (!activeRef.current && !relayRecorderRef.current && !fullRecorderRef.current) {
      return null;
    }

    activeRef.current = false;
    setIsRecording(false);

    if (relayRecorderRef.current?.state === "recording") {
      isStoppingRef.current = true;
    }

    await stopMediaRecorder(relayRecorderRef.current);
    isStoppingRef.current = false;
    relayRecorderRef.current = null;

    if (fullRecorderRef.current?.state === "recording") {
      fullRecorderRef.current.requestData();
    }
    await stopMediaRecorder(fullRecorderRef.current);
    fullRecorderRef.current = null;

    void Promise.allSettled(pendingUploadsRef.current);
    pendingUploadsRef.current = [];

    if (streamRef.current && ownsStreamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    streamRef.current = null;
    ownsStreamRef.current = true;
    archiveOnlyRef.current = false;

    const duration = (Date.now() - startTimeRef.current) / 1000;
    const broadcastId = broadcastIdRef.current;
    const fullBlob = fullChunksRef.current.length
      ? new Blob(fullChunksRef.current, { type: mimeRef.current })
      : null;
    fullChunksRef.current = [];
    initSegmentRef.current = null;

    if (!fullBlob || fullBlob.size === 0) {
      console.error("Recording produced no audio data");
      return null;
    }

    try {
      const file = new File([fullBlob], "message.webm", { type: mimeRef.current });
      const { file_url, file_uri } = await uploadPrivateAudio(
        file,
        `${paramsRef.current.channelId}/messages/${broadcastId}.webm`
      );
      return {
        file_url: file_uri || file_url,
        file_uri: file_uri || file_url,
        duration,
        broadcast_id: broadcastId,
      };
    } catch (err) {
      console.error("Private audio upload failed:", err);
      if (isUploadPermissionError(err)) {
        throw err;
      }
      throw Object.assign(new Error("Private audio upload failed"), {
        code: "app/recording-failed",
        cause: err,
      });
    }
  }, []);

  const getMediaStream = useCallback(() => streamRef.current, []);

  return { isRecording, startRecording, stopLiveRelay, stopRecording, heardBroadcastsRef, getMediaStream };
}
