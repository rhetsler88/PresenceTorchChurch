import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

const LOG_PREFIX = "[PTC:VoiceMessageFailure]";

function normalizeError(error) {
  if (!error) {
    return { code: "app/unknown", message: "Unknown error" };
  }
  return {
    code: error.code || error.name || "app/unknown",
    message: error.message || String(error),
  };
}

/**
 * Structured console + Firestore logging when a voice message fails to archive.
 * Firestore docs live in voiceMessageFailures (admin-readable for incident lookup).
 */
export async function logVoiceMessageFailure({
  source,
  stage,
  error,
  channelId,
  channelIds,
  broadcastId,
  durationSeconds,
  user,
  extra,
}) {
  const { code, message } = normalizeError(error);
  const uid = user?.id || auth.currentUser?.uid || null;

  const payload = {
    source: source || "unknown",
    stage: stage || "unknown",
    error_code: code,
    error_message: message.slice(0, 2000),
    channel_id: channelId || null,
    channel_ids: channelIds?.length ? channelIds : null,
    broadcast_id: broadcastId || null,
    duration_seconds: durationSeconds ?? null,
    user_id: uid,
    user_email: user?.email || auth.currentUser?.email || null,
    user_role: user?.role || null,
    client_timestamp: new Date().toISOString(),
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 512) : null,
    ...(extra && typeof extra === "object" ? { extra } : {}),
  };

  console.error(LOG_PREFIX, payload, error || undefined);

  if (!uid) return;

  try {
    await addDoc(collection(db, "voiceMessageFailures"), {
      ...payload,
      created_date: serverTimestamp(),
    });
  } catch (logErr) {
    console.warn(`${LOG_PREFIX} Could not persist failure log:`, logErr);
  }
}
