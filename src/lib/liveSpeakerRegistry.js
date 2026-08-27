/** In-memory cache of active PTT speakers per channel (from realtime PTT signals). */

import { PTT_SIGNAL_TTL_MS } from "@/lib/pttSignals";

/** @type {Map<string, { senderId: string, broadcastId?: string, at: number }>} */
const byChannel = new Map();

export function recordLivePttSignal({ channel_id, sender_id, broadcast_id } = {}) {
  if (!channel_id || !sender_id) return;
  byChannel.set(channel_id, {
    senderId: sender_id,
    broadcastId: broadcast_id,
    at: Date.now(),
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ptt-live-speaker", {
      detail: { channelId: channel_id, senderId: sender_id },
    }));
  }
}

export function clearLivePttSignal(channelId) {
  if (channelId) byChannel.delete(channelId);
}

export function getCachedLiveSpeaker(channelId, excludeUserId) {
  if (!channelId) return null;
  const entry = byChannel.get(channelId);
  if (!entry || entry.senderId === excludeUserId) return null;
  if (Date.now() - entry.at > PTT_SIGNAL_TTL_MS) {
    byChannel.delete(channelId);
    return null;
  }
  return entry.senderId;
}

export function getCachedBroadcastId(channelId) {
  if (!channelId) return null;
  const entry = byChannel.get(channelId);
  if (!entry || Date.now() - entry.at > PTT_SIGNAL_TTL_MS) return null;
  return entry.broadcastId || null;
}
