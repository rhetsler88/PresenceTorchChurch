import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { functionsApi } from "@/api/client";

/**
 * @param {unknown} err
 * @returns {Error & { code: string; message: string }}
 */
export function formatAudioPlaybackToast(err) {
  const code = err?.code;
  if (code) return `Could not play audio (${code})`;
  return err?.message || "Could not play audio";
}

export function toAudioResolveError(err, fallbackCode = "audio/resolve-failed") {
  const code =
    (typeof err === "object" && err !== null && "code" in err && String(err.code)) ||
    fallbackCode;
  const message =
    (typeof err === "object" && err !== null && "message" in err && String(err.message)) ||
    (err != null ? String(err) : "Could not resolve audio URL");
  console.error("[resolveAudioUrl]", code, message, err);
  const structured = new Error(message);
  structured.code = code;
  return structured;
}

/**
 * Resolves an audio reference to a playable URL.
 *
 * - Public URLs (http/https) are returned directly.
 * - Private file URIs (gs:// or storage paths) are resolved via Firebase Storage.
 * @throws {Error & { code: string }} on resolution failure
 */
export async function resolveAudioUrl(urlOrUri) {
  if (!urlOrUri) return null;
  if (urlOrUri.startsWith("http")) return urlOrUri;
  try {
    if (urlOrUri.startsWith("gs://")) {
      const path = urlOrUri.replace(/^gs:\/\/[^/]+\//, "");
      return getDownloadURL(ref(storage, path));
    }
    /** @type {any} */
    const response = await functionsApi.invoke("getSecureAudioUrl", {
      file_uri: urlOrUri,
    });
    const signed = response.data?.signed_url;
    if (!signed) {
      throw { code: "audio/no-signed-url", message: "Secure audio URL was not returned" };
    }
    return signed;
  } catch (err) {
    throw toAudioResolveError(err);
  }
}
