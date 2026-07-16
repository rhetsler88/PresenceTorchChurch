import { api } from "@/api/client";

/** PTT signals older than this are considered stale and deleted. */
export const PTT_SIGNAL_TTL_MS = 15000;

export function getSignalAgeMs(signal) {
  if (!signal?.created_date) return Number.POSITIVE_INFINITY;
  const ts = new Date(signal.created_date).getTime();
  if (!Number.isFinite(ts)) return Number.POSITIVE_INFINITY;
  return Date.now() - ts;
}

export function isStalePTTSignal(signal, ttlMs = PTT_SIGNAL_TTL_MS) {
  return getSignalAgeMs(signal) > ttlMs;
}

/**
 * Deletes expired PTT signals and returns non-stale signals from other senders.
 */
export async function cleanupStalePTTSignals({
  channelId,
  excludeSenderId,
  limit = 50,
} = {}) {
  const filters = channelId ? { channel_id: channelId } : {};
  const signals = await api.entities.PTTSignal.filter(filters, "-created_date", limit);
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
