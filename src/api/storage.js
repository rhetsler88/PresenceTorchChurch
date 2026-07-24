import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage, auth } from "@/lib/firebase";

async function refreshAuthToken() {
  try {
    await auth.currentUser?.getIdToken(true);
  } catch (err) {
    console.warn("Auth token refresh before upload failed:", err);
  }
}

export async function uploadPublicAudio(file, path) {
  await refreshAuthToken();
  const storageRef = ref(storage, `audio/public/${path}`);
  await uploadBytes(storageRef, file, {
    contentType: file.type || "audio/webm",
  });
  return { file_url: await getDownloadURL(storageRef) };
}

export async function uploadPrivateAudio(file, path) {
  await refreshAuthToken();
  const storageRef = ref(storage, `audio/private/${path}`);
  await uploadBytes(storageRef, file, {
    contentType: file.type || "audio/webm",
  });
  const bucket = storage.app.options.storageBucket;
  const gsUri = `gs://${bucket}/audio/private/${path}`;
  try {
    const downloadUrl = await getDownloadURL(storageRef);
    return { file_uri: gsUri, file_url: downloadUrl };
  } catch (err) {
    console.warn("Private audio download URL unavailable (playback may use gs:// resolve):", err);
    return { file_uri: gsUri };
  }
}
