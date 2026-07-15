import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";

export async function uploadPublicAudio(file, path) {
  const storageRef = ref(storage, `audio/public/${path}`);
  await uploadBytes(storageRef, file);
  return { file_url: await getDownloadURL(storageRef) };
}

export async function uploadPrivateAudio(file, path) {
  const storageRef = ref(storage, `audio/private/${path}`);
  await uploadBytes(storageRef, file);
  const bucket = storage.app.options.storageBucket;
  return { file_uri: `gs://${bucket}/audio/private/${path}` };
}
