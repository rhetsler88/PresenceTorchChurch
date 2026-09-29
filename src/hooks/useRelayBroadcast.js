import { useState, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { api } from "@/api/client";
import { uploadPublicAudio, uploadPrivateAudio } from "@/api/storage";
import { ensureMicrophonePermission } from "@/lib/microphonePermissions";
import { forceStopBackgroundAudio, resumeBackgroundAudioIfNeeded } from "@/lib/backgroundAudio";
import { beginSensitiveOperation, endSensitiveOperation } from "@/lib/sensitiveOperation";
import { destroyMicDenoise, openMicSession } from "@/lib/micDenoise";
import { logVoiceMessageFailure } from "@/lib/voiceMessageLogging";
import { extensionForRecordingMime } from "@/lib/recordingMime";

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
  // Prefer WebM/Opus when supported — Cloud Speech transcribes it reliably; MP4/AAC often fails.
  const types = isAndroid
    ? ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4", "audio/3gpp"]
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

function shouldUseRequestDataMode() {
  return Capacitor.getPlatform() === "android";
}

function startRecorderTiming(recorder, chunkIntervalRef) {
  if (shouldUseRequestDataMode()) {
    recorder.start();
    chunkIntervalRef.current = setInterval(() => {
      if (recorder.state !== "recording") return;
      try {
        recorder.requestData();
      } catch (err) {
        console.error("MediaRecorder.requestData failed:", err);
      }
    }, CHUNK_MS);
    return;
  }

  recorder.start(CHUNK_MS);
}

function clearRecorderTiming(chunkIntervalRef) {
  if (chunkIntervalRef.current) {
    clearInterval(chunkIntervalRef.current);
    chunkIntervalRef.current = null;
  }
}

async function stopMediaRecorder(recorder, chunkIntervalRef) {
  clearRecorderTiming(chunkIntervalRef);
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
  const recordStreamRef = useRef(null);
  const rawStreamRef = useRef(null);
  const denoiseHandleRef = useRef(null);
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
  const chunkIntervalRef = useRef(null);
  const sensitiveOpRef = useRef(false);
  const relayUploadsActiveRef = useRef(true);
  const appendRelayChunkRef = useRef(null);
  const stopInFlightRef = useRef(null);

  const releaseSensitiveOperation = useCallback(() => {
    if (!sensitiveOpRef.current) return;
    sensitiveOpRef.current = false;
    endSensitiveOperation();
  }, []);

  const beginRecordingSensitiveOperation = useCallback(() => {
    if (sensitiveOpRef.current) return;
    sensitiveOpRef.current = true;
    beginSensitiveOperation();
  }, []);

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
    const scheduleUpload = () => {
      const uploadP = uploadChunk(blob, seq, isFinal).catch((err) => {
        console.error("Relay chunk upload failed:", err);
      });
      pendingUploadsRef.current.push(uploadP);
      return uploadP;
    };

    if (Capacitor.isNativePlatform()) {
      setTimeout(scheduleUpload, 0);
      return Promise.resolve();
    }

    return scheduleUpload();
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

    beginRecordingSensitiveOperation();

    archiveOnlyRef.current = archiveOnly;
    ownsStreamRef.current = ownsStream ?? !sharedStream;

    // Android needs the silent AudioTrack released for mic focus.
    // iOS must keep the shared AVAudioSession — stopping it kills Agora/WebRTC.
    if (Capacitor.getPlatform() === "android") {
      await forceStopBackgroundAudio();
    }

    if (sharedStream) {
      streamRef.current = sharedStream;
      recordStreamRef.current = sharedStream;
      rawStreamRef.current = null;
      denoiseHandleRef.current = null;
    } else {
      try {
        if (Capacitor.isNativePlatform()) {
          const permitted = await ensureMicrophonePermission();
          if (!permitted) {
            releaseSensitiveOperation();
            return false;
          }
        }
        const {
          recordStream,
          publishStream,
          handle,
          rawStream,
        } = await openMicSession();
        recordStreamRef.current = recordStream;
        streamRef.current = publishStream;
        rawStreamRef.current = rawStream;
        denoiseHandleRef.current = handle;
      } catch (err) {
        console.error("Microphone access denied:", err);
        releaseSensitiveOperation();
        return false;
      }
    }

    broadcastIdRef.current = broadcastId || crypto.randomUUID();
    heardBroadcastsRef.current.add(broadcastIdRef.current);
    sequenceRef.current = 0;
    fullChunksRef.current = [];
    initSegmentRef.current = null;
    pendingUploadsRef.current = [];
    relayUploadsActiveRef.current = true;
    activeRef.current = true;

    const mimeType = getSupportedMime();
    mimeRef.current = mimeType || "audio/webm";
    const useSingleRecorder = Capacitor.isNativePlatform();

    const appendArchiveChunk = (event) => {
      if (event.data?.size > 0) {
        fullChunksRef.current.push(event.data);
      }
    };

    const appendRelayChunk = (event, isFinalChunk) => {
      if (!event.data || event.data.size === 0) return;
      if (archiveOnlyRef.current) return;
      if (!relayUploadsActiveRef.current && !isFinalChunk) return;

      let uploadBlob;
      if (!initSegmentRef.current) {
        initSegmentRef.current = event.data;
        uploadBlob = event.data;
      } else {
        uploadBlob = new Blob([initSegmentRef.current, event.data], { type: mimeRef.current });
      }
      queueChunkUpload(uploadBlob, isFinalChunk);
    };
    appendRelayChunkRef.current = appendRelayChunk;

    const recordingStream = recordStreamRef.current || streamRef.current;

    if (useSingleRecorder) {
      const recorder = createMediaRecorder(recordingStream, mimeType);
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
      const relayRecorder = createMediaRecorder(recordingStream, mimeType);
      relayRecorder.onerror = (event) => {
        console.error("Relay MediaRecorder error:", event);
      };
      relayRecorder.ondataavailable = (event) => {
        appendRelayChunk(event, isStoppingRef.current);
      };
      relayRecorderRef.current = relayRecorder;

      const fullRecorder = createMediaRecorder(recordingStream, mimeType);
      fullRecorder.onerror = (event) => {
        console.error("Archive MediaRecorder error:", event);
      };
      fullRecorder.ondataavailable = appendArchiveChunk;
      fullRecorderRef.current = fullRecorder;
    } else {
      const fullRecorder = createMediaRecorder(recordingStream, mimeType);
      fullRecorder.onerror = (event) => {
        console.error("Archive MediaRecorder error:", event);
      };
      fullRecorder.ondataavailable = appendArchiveChunk;
      fullRecorderRef.current = fullRecorder;
    }

    try {
      if (useSingleRecorder) {
        startRecorderTiming(relayRecorderRef.current, chunkIntervalRef);
      } else if (!archiveOnly) {
        startRecorderTiming(relayRecorderRef.current, chunkIntervalRef);
        if (shouldUseRequestDataMode()) {
          startRecorderTiming(fullRecorderRef.current, chunkIntervalRef);
        } else {
          fullRecorderRef.current.start(sharedStream ? CHUNK_MS : undefined);
        }
      } else {
        startRecorderTiming(fullRecorderRef.current, chunkIntervalRef);
      }
      startTimeRef.current = Date.now();
      const startedRecorder = relayRecorderRef.current || fullRecorderRef.current;
      if (startedRecorder?.mimeType) {
        mimeRef.current = startedRecorder.mimeType;
      }
    } catch (err) {
      console.error("MediaRecorder.start failed:", err);
      activeRef.current = false;
      relayRecorderRef.current = null;
      fullRecorderRef.current = null;
      clearRecorderTiming(chunkIntervalRef);
      if (streamRef.current && ownsStreamRef.current) {
        await destroyMicDenoise({
          handle: denoiseHandleRef.current,
          rawStream: rawStreamRef.current,
          recordStream: recordStreamRef.current,
          publishStream: streamRef.current,
        });
      }
      streamRef.current = null;
      recordStreamRef.current = null;
      rawStreamRef.current = null;
      denoiseHandleRef.current = null;
      releaseSensitiveOperation();
      return false;
    }

    setIsRecording(true);
    return true;
  }, [queueChunkUpload, beginRecordingSensitiveOperation, releaseSensitiveOperation]);

  const stopLiveRelay = useCallback(async () => {
    relayUploadsActiveRef.current = false;

    // Native uses one MediaRecorder for relay + archive — keep it running until stopRecording.
    if (Capacitor.isNativePlatform()) {
      const recorder = relayRecorderRef.current;
      if (recorder?.state === "recording") {
        try {
          recorder.requestData();
        } catch {
          // Some Android builds reject requestData in certain states.
        }
      }
      return;
    }

    if (!relayRecorderRef.current) return;
    if (relayRecorderRef.current.state === "recording") {
      isStoppingRef.current = true;
    }
    await stopMediaRecorder(relayRecorderRef.current, chunkIntervalRef);
    isStoppingRef.current = false;
    relayRecorderRef.current = null;
  }, []);

  const stopRecording = useCallback(async () => {
    if (stopInFlightRef.current) {
      return stopInFlightRef.current;
    }

    const finalize = (async () => {
      if (!activeRef.current && !relayRecorderRef.current && !fullRecorderRef.current) {
        releaseSensitiveOperation();
        return null;
      }

      activeRef.current = false;
      relayUploadsActiveRef.current = false;
      setIsRecording(false);

      if (relayRecorderRef.current?.state === "recording") {
        isStoppingRef.current = true;
      }

      await stopMediaRecorder(relayRecorderRef.current, chunkIntervalRef);
      isStoppingRef.current = false;
      relayRecorderRef.current = null;

      if (fullRecorderRef.current?.state === "recording") {
        try {
          fullRecorderRef.current.requestData();
        } catch {
          // ignore
        }
      }
      await stopMediaRecorder(fullRecorderRef.current, chunkIntervalRef);
      fullRecorderRef.current = null;

      void Promise.allSettled(pendingUploadsRef.current);
      pendingUploadsRef.current = [];

      if (streamRef.current && ownsStreamRef.current) {
        await destroyMicDenoise({
          handle: denoiseHandleRef.current,
          rawStream: rawStreamRef.current,
          recordStream: recordStreamRef.current,
          publishStream: streamRef.current,
        });
      }
      streamRef.current = null;
      recordStreamRef.current = null;
      rawStreamRef.current = null;
      denoiseHandleRef.current = null;
      ownsStreamRef.current = true;
      archiveOnlyRef.current = false;
      releaseSensitiveOperation();

      const duration = Math.max(0.1, (Date.now() - startTimeRef.current) / 1000);
      const broadcastId = broadcastIdRef.current;
      const archiveChunks = fullChunksRef.current.length
        ? fullChunksRef.current
        : initSegmentRef.current
          ? [initSegmentRef.current]
          : [];
      const fullBlob = archiveChunks.length
        ? new Blob(archiveChunks, { type: mimeRef.current })
        : null;
      fullChunksRef.current = [];
      initSegmentRef.current = null;

      const recordingMime = fullBlob?.type || mimeRef.current;

      if (!fullBlob || fullBlob.size === 0) {
        console.error("Recording produced no audio data", {
          duration,
          channelId: paramsRef.current.channelId,
          mime: recordingMime,
        });
        const { channelId, userId, userName } = paramsRef.current;
        await logVoiceMessageFailure({
          source: "relay",
          stage: "empty-recording",
          error: Object.assign(new Error("Recording produced no audio data"), {
            code: "app/empty-recording",
          }),
          channelId,
          broadcastId,
          durationSeconds: duration,
          user: userId ? { id: userId, email: null, role: null } : null,
          extra: { mime: recordingMime, user_name: userName || null },
        });
        throw Object.assign(new Error("Recording produced no audio data"), {
          code: "app/empty-recording",
          logged: true,
        });
      }

      try {
        const ext = extensionForRecordingMime(recordingMime);
        const file = new File([fullBlob], `message.${ext}`, { type: recordingMime });
        const { file_url, file_uri } = await uploadPrivateAudio(
          file,
          `${paramsRef.current.channelId}/messages/${broadcastId}.${ext}`
        );
        return {
          file_url,
          file_uri,
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
    })();

    stopInFlightRef.current = finalize;
    try {
      return await finalize;
    } finally {
      stopInFlightRef.current = null;
      if (Capacitor.isNativePlatform()) {
        void resumeBackgroundAudioIfNeeded();
      }
    }
  }, [releaseSensitiveOperation]);

  const getMediaStream = useCallback(() => streamRef.current, []);

  /** Re-enable live chunk uploads when Agora publish fails after archive-only start. */
  const enableLiveRelay = useCallback(() => {
    if (!activeRef.current || !archiveOnlyRef.current) return;
    archiveOnlyRef.current = false;
    relayUploadsActiveRef.current = true;

    // Native uses one recorder for relay + archive — flipping archiveOnly is enough.
    if (Capacitor.isNativePlatform()) {
      const recorder = relayRecorderRef.current;
      if (recorder?.state === "recording") {
        try {
          recorder.requestData();
        } catch {
          /* ignore */
        }
      }
      return;
    }

    if (relayRecorderRef.current || !recordStreamRef.current) {
      return;
    }

    const appendRelayChunk = appendRelayChunkRef.current;
    if (!appendRelayChunk) return;

    const mimeType = mimeRef.current || getSupportedMime();
    const relayRecorder = createMediaRecorder(recordStreamRef.current, mimeType);
    relayRecorder.onerror = (event) => {
      console.error("Relay MediaRecorder error:", event);
    };
    relayRecorder.ondataavailable = (event) => {
      appendRelayChunk(event, isStoppingRef.current);
    };
    relayRecorderRef.current = relayRecorder;
    startRecorderTiming(relayRecorderRef.current, chunkIntervalRef);
  }, []);

  return {
    isRecording,
    startRecording,
    stopLiveRelay,
    stopRecording,
    enableLiveRelay,
    heardBroadcastsRef,
    getMediaStream,
  };
}
