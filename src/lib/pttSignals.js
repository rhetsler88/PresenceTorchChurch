import {
  collection,
  doc,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { api } from "@/api/client";
import { auth, db } from "@/lib/firebase";
import { logVoiceMessageFailure } from "@/lib/voiceMessageLogging";

/** PTT signals older than this are considered stale and ignored for busy/claim. */
export const PTT_SIGNAL_TTL_MS = 15000;

const PTT_CLAIM_MAX_ATTEMPTS = 4;
const PTT_SIGNALS_COLLECTION = "pttSignals";

export function getSignalAgeMs(signal) {
  if (!signal?.created_date) return Number.POSITIVE_INFINITY;
  const ts = new Date(signal.created_date).getTime();
  if (!Number.isFinite(ts)) return Number.POSITIVE_INFINITY;
  return Date.now() - ts;
}

export function getSignalAgeMsFromFirestore(data) {
  if (!data?.created_date) return Number.POSITIVE_INFINITY;
  const raw = data.created_date;
  if (typeof raw?.toMillis === "function") {
    return Date.now() - raw.toMillis();
  }
  if (raw instanceof Date) {
    return Date.now() - raw.getTime();
  }
  if (typeof raw === "string") {
    return getSignalAgeMs({ created_date: raw });
  }
  return Number.POSITIVE_INFINITY;
}

export function isStalePTTSignal(signal, ttlMs = PTT_SIGNAL_TTL_MS) {
  return getSignalAgeMs(signal) > ttlMs;
}

function isStaleFirestoreSignal(data, ttlMs = PTT_SIGNAL_TTL_MS) {
  return getSignalAgeMsFromFirestore(data) > ttlMs;
}

function omitUndefinedFields(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

function isRetryableClaimError(err) {
  const code = err?.code || "";
  return (
    code === "permission-denied"
    || code === "unavailable"
    || code === "deadline-exceeded"
    || code === "resource-exhausted"
    || code === "aborted"
    || code === "failed-precondition"
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requireAuthUid() {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) {
    throw Object.assign(new Error("Not authenticated"), { code: "auth/not-authenticated" });
  }
  await user.getIdToken(true);
  return user.uid;
}

function firestoreDocToSignal(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    ...data,
    created_date: data.created_date?.toDate?.()?.toISOString?.()
      ?? (data.created_date instanceof Date ? data.created_date.toISOString() : data.created_date),
  };
}

/**
 * Transactionally claim one channel: create a PTT signal only when no live claim exists.
 * @returns {Promise<{ won: true, signal: object } | { won: false, holder: { sender_id: string, sender_name?: string } }>}
 */
async function claimPttChannelTransactional({
  channelId,
  senderId,
  senderName,
  broadcastId,
}) {
  const uid = await requireAuthUid();
  if (senderId !== uid) {
    throw Object.assign(new Error("Sender must match signed-in user"), { code: "app/claim-sender-mismatch" });
  }

  const claimQuery = query(
    collection(db, PTT_SIGNALS_COLLECTION),
    where("channel_id", "==", channelId),
    limit(30)
  );

  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(claimQuery);
    let holder = null;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (isStaleFirestoreSignal(data)) {
        if (data.sender_id === uid) {
          transaction.delete(docSnap.ref);
        }
        continue;
      }

      if (data.sender_id === uid) {
        return { won: true, signal: firestoreDocToSignal(docSnap) };
      }

      holder = {
        sender_id: data.sender_id || "",
        sender_name: data.sender_name || "",
      };
      return { won: false, holder };
    }

    const newRef = doc(collection(db, PTT_SIGNALS_COLLECTION));
    const payload = omitUndefinedFields({
      channel_id: channelId,
      sender_id: senderId,
      sender_name: senderName || "",
      ...(broadcastId ? { broadcast_id: broadcastId } : {}),
      created_by_id: uid,
      created_date: serverTimestamp(),
    });
    transaction.set(newRef, payload);
    return {
      won: true,
      signal: {
        id: newRef.id,
        channel_id: channelId,
        sender_id: senderId,
        sender_name: senderName || "",
        ...(broadcastId ? { broadcast_id: broadcastId } : {}),
        created_by_id: uid,
        created_date: new Date().toISOString(),
      },
    };
  });
}

async function claimPttChannelWithRetry(params) {
  let lastErr;
  for (let attempt = 0; attempt < PTT_CLAIM_MAX_ATTEMPTS; attempt++) {
    try {
      return await claimPttChannelTransactional(params);
    } catch (err) {
      lastErr = err;
      if (!isRetryableClaimError(err) || attempt >= PTT_CLAIM_MAX_ATTEMPTS - 1) {
        throw err;
      }
      await sleep(180 * (attempt + 1));
    }
  }
  throw lastErr;
}

/** Best-effort delete of claimed PTT signals (rollback). */
export async function releasePttSignals(signalIds = []) {
  if (!signalIds.length) return;
  await Promise.all(
    signalIds.map((id) => api.entities.PTTSignal.delete(id).catch(() => {}))
  );
}

/**
 * Claim one or more channels for PTT (sequential, transactional per channel).
 * Rolls back any channels already claimed if a later channel is busy or fails.
 *
 * @returns {Promise<
 *   | { won: true, signalIds: string[], signals: object[], primaryChannelId: string }
 *   | { won: false, holder: object, channelId: string, signalIds: [] }
 * >}
 */
export async function claimPttChannels({
  channelIds = [],
  senderId,
  senderName,
  broadcastId,
  primaryChannelId,
}) {
  const ids = [...new Set(channelIds.filter(Boolean))];
  if (!ids.length || !senderId) {
    throw Object.assign(new Error("No channels to claim"), { code: "app/no-channels" });
  }

  const primaryId = ids.includes(primaryChannelId) ? primaryChannelId : ids[0];
  const createdIds = [];
  const signals = [];

  try {
    for (const channelId of ids) {
      const result = await claimPttChannelWithRetry({
        channelId,
        senderId,
        senderName,
        broadcastId,
      });

      if (!result.won) {
        await releasePttSignals(createdIds);
        return {
          won: false,
          holder: result.holder,
          channelId,
          signalIds: [],
        };
      }

      createdIds.push(result.signal.id);
      signals.push(result.signal);
    }

    return {
      won: true,
      signalIds: createdIds,
      signals,
      primaryChannelId: primaryId,
    };
  } catch (err) {
    await releasePttSignals(createdIds);
    throw err;
  }
}

/**
 * Stop an in-progress recording when PTT startup aborts (no voice message will be sent).
 */
export async function discardPttRecording(
  stopRecording,
  {
    source,
    channelId,
    channelIds,
    user,
    reason = "PTT recording discarded during startup",
  } = {}
) {
  if (typeof stopRecording !== "function") return;
  try {
    const result = await stopRecording();
    if (!result) return;
    await logVoiceMessageFailure({
      source: source || "ptt",
      stage: "ptt-recording-discarded",
      error: Object.assign(new Error(reason), { code: "app/ptt-recording-discarded" }),
      channelId: channelId || null,
      channelIds,
      broadcastId: result.broadcast_id,
      durationSeconds: result.duration,
      user,
      extra: { file_url: result.file_url ?? null },
    });
  } catch (err) {
    console.warn("[PTT] discardPttRecording failed:", err);
  }
}

/**
 * Deletes expired PTT signals and returns non-stale signals from other senders.
 * @param {{ channelId?: string, channelIds?: string[], excludeSenderId?: string, limit?: number }} [options]
 */
export async function cleanupStalePTTSignals({
  channelId,
  channelIds,
  excludeSenderId,
  limit: limitCount = 50,
} = {}) {
  const ids = channelIds?.length ? channelIds : channelId ? [channelId] : [];
  const batches = ids.length
    ? await Promise.all(
        ids.map((id) =>
          api.entities.PTTSignal.filter({ channel_id: id }, "-created_date", limitCount)
        )
      )
    : [];
  const signals = batches.flat();
  const activeFromOthers = [];

  for (const signal of signals) {
    if (isStalePTTSignal(signal)) {
      api.entities.PTTSignal.delete(signal.id).catch(() => {});
      continue;
    }
    if (!excludeSenderId || signal.sender_id !== excludeSenderId) {
      activeFromOthers.push(signal);
    }
  }

  return activeFromOthers;
}
