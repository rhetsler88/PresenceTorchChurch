/** Ensures stopRecording / upload output is safe to persist as VoiceMessage.audio_url. */
export function assertPlayableSendPayload(result) {
  if (!result) {
    throw Object.assign(new Error("Recording produced no audio or upload failed"), {
      code: "app/recording-failed",
    });
  }
  if (!result.file_url) {
    throw Object.assign(new Error("Audio upload did not return a playable URL"), {
      code: "app/upload-failed",
      retryable: true,
    });
  }
  return result;
}
