import { useState, useCallback, useRef } from "react";
import { api } from "@/api/client";
import { uploadPublicAudio, uploadPrivateAudio } from "@/api/storage";

const CHUNK_MS = 1000;

function getSupportedMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

/**
 * Half-duplex relay broadcast hook.
 *
 * Uses a single MediaRecorder with timeslice to produce relay chunks
 * and the full recording for VoiceMessage history.
 */
export default function useRelayBroadcast({ channelId, userId, userName }) {
  const [isRecording, setIsRecording] = useState(false);

  const paramsRef = useRef({ channelId, userId, userName });
  paramsRef.current = { channelId, userId, userName };

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const fullChunksRef = useRef([]);
  const mimeRef = useRef("audio/webm");
  const broadcastIdRef = useRef(null);
  const sequenceRef = useRef(0);
  const startTimeRef = useRef(0);
  const activeRef = useRef(false);
  const isStoppingRef = useRef(false);
  const initSegmentRef = useRef(null);
  const pendingUploadsRef = useRef([]);

  const uploadChunk = useCallback(async (blob, seq, isFinal) => {
    const { channelId, userId, userName } = paramsRef.current;
    if (!channelId || !userId || !blob || blob.size === 0) return;

    const file = new File([blob], "chunk.webm", { type: blob.type || mimeRef.current });
    const { file_url } = await uploadPublicAudio(
      file,
      `${channelId}/chunks/${broadcastIdRef.current}/${seq}.webm`
    );
    await api.entities.AudioChunk.create({
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
    if (isFinal) {
      return uploadP;
    }
    return uploadP;
  }, [uploadChunk]);

  const startRecording = useCallback(async () => {
    const { channelId, userId } = paramsRef.current;
    if (!channelId || !userId) return false;
    if (activeRef.current) return true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
    } catch (err) {
      console.error("Microphone access denied:", err);
      return false;
    }

    broadcastIdRef.current = crypto.randomUUID();
    sequenceRef.current = 0;
    fullChunksRef.current = [];
    initSegmentRef.current = null;
    pendingUploadsRef.current = [];
    startTimeRef.current = Date.now();
    activeRef.current = true;

    const mimeType = getSupportedMime();
    mimeRef.current = mimeType || "audio/webm";
    const recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : {});

    recorder.ondataavailable = (event) => {
      if (!event.data || event.data.size === 0) return;
      fullChunksRef.current.push(event.data);

      let uploadBlob;
      if (!initSegmentRef.current) {
        initSegmentRef.current = event.data;
        uploadBlob = event.data;
      } else {
        uploadBlob = new Blob([initSegmentRef.current, event.data], { type: mimeRef.current });
      }
      queueChunkUpload(uploadBlob, isStoppingRef.current);
    };

    recorderRef.current = recorder;
    recorder.start(CHUNK_MS);
    setIsRecording(true);
    return true;
  }, [queueChunkUpload]);

  const stopRecording = useCallback(async () => {
    if (!activeRef.current && !recorderRef.current) return null;

    activeRef.current = false;
    setIsRecording(false);

    if (recorderRef.current && recorderRef.current.state === "recording") {
      isStoppingRef.current = true;
      await new Promise((resolve) => {
        recorderRef.current.addEventListener("stop", resolve, { once: true });
        recorderRef.current.stop();
      });
      isStoppingRef.current = false;
    }

    // Don't block channel release on relay chunk uploads finishing
    void Promise.allSettled(pendingUploadsRef.current);
    pendingUploadsRef.current = [];

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    const duration = (Date.now() - startTimeRef.current) / 1000;
    const broadcastId = broadcastIdRef.current;
    const fullBlob = fullChunksRef.current.length
      ? new Blob(fullChunksRef.current, { type: mimeRef.current })
      : null;

    recorderRef.current = null;
    fullChunksRef.current = [];

    if (!fullBlob || fullBlob.size === 0) {
      console.error("Recording produced no audio data");
      return null;
    }

    try {
      const file = new File([fullBlob], "message.webm", { type: mimeRef.current });
      const { file_uri } = await uploadPrivateAudio(
        file,
        `${paramsRef.current.channelId}/messages/${broadcastId}.webm`
      );
      return { file_url: file_uri, duration, broadcast_id: broadcastId };
    } catch (err) {
      console.error("Private audio upload failed:", err);
      return null;
    }
  }, []);

  return { isRecording, startRecording, stopRecording };
}
