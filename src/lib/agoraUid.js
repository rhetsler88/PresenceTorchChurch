/** Stable numeric Agora UID from Firebase auth uid (must match Cloud Function). */
export function agoraUidFromFirebaseId(firebaseUid) {
  if (!firebaseUid) return 0;
  let hash = 5381;
  for (let i = 0; i < firebaseUid.length; i++) {
    hash = (hash * 33) ^ firebaseUid.charCodeAt(i);
  }
  return Math.abs(hash >>> 0) % 2147483647 || 1;
}
