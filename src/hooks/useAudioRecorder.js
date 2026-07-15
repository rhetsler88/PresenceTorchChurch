import { useState, useRef, useCallback } from "react";
import { api } from "@/api/client";

export default function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startTimeRef = useRef(null);

  const startRecording = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm",
    });
    chunksRef.current = [];
    mediaRecorderRef.current = mediaRecorder;
    startTimeRef.current = Date.now();

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorder.start(100);
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(async () => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === "inactive") {
        resolve(null);
        return;
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const duration = (Date.now() - startTimeRef.current) / 1000;
        // Stop all tracks
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
        setIsRecording(false);

        // Upload the audio
        const file = new File([blob], `voice_${Date.now()}.webm`, { type: "audio/webm" });
        const { file_url } = await api.integrations.Core.UploadFile({ file });
        resolve({ file_url, duration, blob });
      };

      mediaRecorder.stop();
    });
  }, []);

  return { isRecording, startRecording, stopRecording };
}