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
 * While PTT is held, records audio in 1-second self-contained chunks and
 * uploads each one immediately, creating an AudioChunk entity so other
 * channel members can hear it live via realtime subscription.
 *
 * Simultaneously maintains a continuous recording (second MediaRecorder on
 * the same stream) for the final VoiceMessage (transcription + history).
 */
export default function useRelayBroadcast({ channelId, userId, userName }) {
  const [isRecording, setIsRecording] = useState(false);

  const paramsRef = useRef({ channelId, userId, userName });
  paramsRef.current = { channelId, userId, userName };

  const streamRef = useRef(null);
  const fullRecorderRef = useRef(null);
  const fullChunksRef = useRef([]);
  const fullMimeRef = useRef("audio/webm");
  const chunkRecorderRef = useRef(null);
  const chunkTimerRef = useRef(null);
  const broadcastIdRef = useRef(null);
  const sequenceRef = useRef(0);
  const startTimeRef = useRef(0);
  const activeRef = useRef(false);
  const finalChunkDoneRef = useRef(Promise.resolve());

  const uploadChunk = useCallback(async (blob, seq, isFinal) => {
    const { channelId, userId, userName } = paramsRef.current;
    if (!channelId || !userId) return;
    try {
      const file = new File([blob], "chunk.webm", { type: blob.type || "audio/webm" });
      const { file_url } = await uploadPublicAudio(
        file,
        `chunks/${broadcastIdRef.current}/${seq}.webm`
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
    } catch (e) {
      // Non-critical — full recording still works
    }
  }, []);

  const startChunkCycle = useCallback(() => {
    if (!activeRef.current || !streamRef.current) return;

    const mimeType = getSupportedMime();
    const recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : {});
    const chunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      if (chunks.length === 0) return;
      const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
      const seq = sequenceRef.current;
      sequenceRef.current++;
      const isFinal = !activeRef.current;
      const uploadP = uploadChunk(blob, seq, isFinal);
      if (isFinal) {
        finalChunkDoneRef.current = uploadP;
      }
      if (activeRef.current) startChunkCycle();
    };

    chunkRecorderRef.current = recorder;
    recorder.start();

    chunkTimerRef.current = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, CHUNK_MS);
  }, [uploadChunk]);

  const startRecording = useCallback(async () => {
    const { channelId, userId } = paramsRef.current;
    if (!channelId || !userId) return;
    if (activeRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
    } catch (e) {
      return;
    }

    broadcastIdRef.current = crypto.randomUUID();
    sequenceRef.current = 0;
    fullChunksRef.current = [];
    startTimeRef.current = Date.now();
    activeRef.current = true;
    finalChunkDoneRef.current = Promise.resolve();
    setIsRecording(true);

    // Continuous full recording for VoiceMessage
    const mimeType = getSupportedMime();
    fullMimeRef.current = mimeType || "audio/webm";
    const fullRecorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : {});
    fullRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) fullChunksRef.current.push(e.data);
    };
    fullRecorderRef.current = fullRecorder;
    fullRecorder.start();

    // Start chunked relay
    startChunkCycle();
  }, [startChunkCycle]);

  const stopRecording = useCallback(async () => {
    activeRef.current = false;
    if (chunkTimerRef.current) {
      clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }

    // Stop chunk recorder and wait for final chunk upload
    if (chunkRecorderRef.current && chunkRecorderRef.current.state === "recording") {
      await new Promise((resolve) => {
        chunkRecorderRef.current.addEventListener("stop", resolve, { once: true });
        chunkRecorderRef.current.stop();
      });
    }
    await finalChunkDoneRef.current;

    // Stop full recorder and collect blob
    let fullBlob = null;
    if (fullRecorderRef.current && fullRecorderRef.current.state === "recording") {
      fullBlob = await new Promise((resolve) => {
        fullRecorderRef.current.addEventListener("stop", () => {
          resolve(new Blob(fullChunksRef.current, { type: fullMimeRef.current }));
        }, { once: true });
        fullRecorderRef.current.stop();
      });
    }

    // Cleanup stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    setIsRecording(false);

    const duration = (Date.now() - startTimeRef.current) / 1000;
    const broadcastId = broadcastIdRef.current;

    if (!fullBlob || fullBlob.size === 0) return null;

    try {
      const file = new File([fullBlob], "message.webm", { type: fullMimeRef.current });
      const { file_uri } = await uploadPrivateAudio(file, `messages/${broadcastId}.webm`);
      return { file_url: file_uri, duration, broadcast_id: broadcastId };
    } catch (e) {
      return null;
    }
  }, []);

  return { isRecording, startRecording, stopRecording };
}