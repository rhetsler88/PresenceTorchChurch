/** @typedef {Record<string, unknown>} VoiceMessageData */

/**
 * Parse a Firebase Storage object path from a download URL or gs:// URI.
 * @param {unknown} url
 * @returns {string | null}
 */
function storagePathFromDownloadUrl(url) {
  if (!url || typeof url !== "string") return null;

  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("gs://")) {
    const path = trimmed.replace(/^gs:\/\/[^/]+\//, "");
    return path || null;
  }

  if (trimmed.startsWith("audio/")) {
    return trimmed;
  }

  if (trimmed.startsWith("http")) {
    const firebaseMatch = trimmed.match(/\/o\/([^?]+)/);
    if (firebaseMatch) {
      try {
        return decodeURIComponent(firebaseMatch[1]);
      } catch {
        return null;
      }
    }
    return null;
  }

  if (trimmed.startsWith("/")) {
    return trimmed.replace(/^\//, "") || null;
  }

  return null;
}

const STORED_PATH_FIELDS = ["storage_path", "storagePath", "audio_storage_path", "file_path"];

/**
 * Resolve Storage object path for a voice message document.
 * @param {VoiceMessageData | null | undefined} data
 * @returns {string | null}
 */
function resolveVoiceMessageStoragePath(data) {
  if (!data || typeof data !== "object") return null;

  for (const field of STORED_PATH_FIELDS) {
    const value = data[field];
    if (typeof value === "string" && value.trim()) {
      const fromStored = storagePathFromDownloadUrl(value.trim());
      if (fromStored) return fromStored;
    }
  }

  const audioUrl = data.audio_url;
  if (typeof audioUrl !== "string" || !audioUrl.trim()) return null;

  return storagePathFromDownloadUrl(audioUrl);
}

module.exports = {
  storagePathFromDownloadUrl,
  resolveVoiceMessageStoragePath,
};
