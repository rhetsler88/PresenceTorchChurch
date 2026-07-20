/** Stable numeric Agora UID from Firebase auth uid (must match Cloud Function). */
export function agoraUidFromFirebaseId(firebaseUid) {
  if (!firebaseUid) return 0;
  let hash = 5381;
  for (let i = 0; i < firebaseUid.length; i++) {
    hash = (hash * 33) ^ firebaseUid.charCodeAt(i);
  }
  return Math.abs(hash >>> 0) % 2147483647 || 1;
}

const SESSION_UID_KEY = "ptc_agora_session_uid";

/**
 * Unique Agora UID per browser tab so two windows with the same login can
 * join and hear each other (Firebase uid alone would collide in Agora).
 */
export function getSessionAgoraUid(firebaseUid) {
  if (!firebaseUid) return 0;
  if (typeof sessionStorage === "undefined") {
    return agoraUidFromFirebaseId(firebaseUid);
  }

  const stored = sessionStorage.getItem(SESSION_UID_KEY);
  if (stored) {
    const parsed = Number(stored);
    if (Number.isFinite(parsed) && parsed > 0 && parsed < 2147483647) {
      return Math.floor(parsed);
    }
  }

  const sessionId = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const uid = agoraUidFromFirebaseId(`${firebaseUid}:${sessionId}`);
  sessionStorage.setItem(SESSION_UID_KEY, String(uid));
  return uid;
}

export function isSameAgoraUid(a, b) {
  return a === b || String(a) === String(b);
}
