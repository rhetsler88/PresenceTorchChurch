/** @param {string | undefined} mimeType MediaRecorder MIME (may include codecs suffix). */
export function extensionForRecordingMime(mimeType) {
  const base = (mimeType || "").split(";")[0].trim().toLowerCase();
  if (base === "audio/3gpp") return "3gp";
  if (base === "audio/mp4") return "m4a";
  if (base === "audio/ogg") return "ogg";
  if (base === "audio/webm") return "webm";
  return "webm";
}
