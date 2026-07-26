import { api } from "@/api/client";

/** PTT signals older than this are considered stale and deleted. */
export const PTT_SIGNAL_TTL_MS = 15000;

const PTT_CLAIM_MAX_ATTEMPTS = 4;

export function getSignalAgeMs(signal) {
  if (!signal?.created_date) return Number.POSITIVE_INFINITY;
  const ts = new Date(signal.created_date).getTime();
  if (!Number.isFinite(ts)) return Number.POSITIVE_INFINITY;
  return Date.now() - ts;
}

export function isStalePTTSignal(signal, ttlMs = PTT_SIGNAL_TTL_MS) {
  return getSignalAgeMs(signal) > ttlMs;
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
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create one PTT signal with retries for transient Firestore/auth failures.
 */
export async function createPttSignalWithRetry(data, { maxAttempts = PTT_CLAIM_MAX_ATTEMPTS } = {}) {
  const payload = omitUndefinedFields(data);
  let lastErr;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await api.entities.PTTSignal.create(payload);
    } catch (err) {
      lastErr = err;
      if (!isRetryableClaimError(err) || attempt >= maxAttempts - 1) {
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
 * Claim one or more channels for PTT. Creates signals sequentially with retry;
 * rolls back all created signals if any channel fails.
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
      const signal = await createPttSignalWithRetry({
        channel_id: channelId,
        sender_id: senderId,
        sender_name: senderName || "",
        ...(channelId === primaryId && broadcastId ? { broadcast_id: broadcastId } : {}),
      });
      createdIds.push(signal.id);
      signals.push(signal);
    }
    return { signalIds: createdIds, signals, primaryChannelId: primaryId };
  } catch (err) {
    await releasePttSignals(createdIds);
    throw err;
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
  limit = 50,
} = {}) {
  const ids = channelIds?.length ? channelIds : channelId ? [channelId] : [];
  const batches = ids.length
    ? await Promise.all(
        ids.map((id) =>
          api.entities.PTTSignal.filter({ channel_id: id }, "-created_date", limit)
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
