import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { functionsApi } from "@/api/client";

/**
 * Resolves an audio reference to a playable URL.
 *
 * - Public URLs (http/https) are returned directly.
 * - Private file URIs (gs:// or storage paths) are resolved via Firebase Storage.
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
    return response.data?.signed_url || null;
  } catch {
    return null;
  }
}
