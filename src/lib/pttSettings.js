/** Device-local per-speaker listen volumes — no Firestore cost. */

import { cleanupStalePTTSignals } from "@/lib/pttSignals";
import { getCachedLiveSpeaker } from "@/lib/liveSpeakerRegistry";

export const PTT_SETTINGS_CHANGED = "ptt-settings-changed";

export const USER_LISTEN_VOLUMES_KEY = "ptt_user_listen_volumes";

export const AUDIO_LEVEL_MIN = 50;
export const AUDIO_LEVEL_MAX = 150;
export const AUDIO_LEVEL_DEFAULT = 100;

/** @typedef {{ v: number, n?: string }} UserListenEntry */

function clampLevel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return AUDIO_LEVEL_DEFAULT;
  return Math.min(AUDIO_LEVEL_MAX, Math.max(AUDIO_LEVEL_MIN, Math.round(n)));
}

/** @returns {Record<string, UserListenEntry>} */
function readVolumeMap() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(USER_LISTEN_VOLUMES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** @param {Record<string, UserListenEntry>} map */
function writeVolumeMap(map) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(USER_LISTEN_VOLUMES_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

/** How loud you hear a specific person (50–150%, default 100). */
export function getUserListenVolume(userId) {
  if (!userId) return AUDIO_LEVEL_DEFAULT;
  const entry = readVolumeMap()[userId];
  return clampLevel(entry?.v ?? AUDIO_LEVEL_DEFAULT);
}

/** @returns {Array<{ userId: string, volume: number, displayName?: string }>} */
export function listUserListenOverrides() {
  return Object.entries(readVolumeMap())
    .map(([userId, entry]) => ({
      userId,
      volume: clampLevel(entry?.v),
      displayName: entry?.n?.trim() || undefined,
    }))
    .filter(({ volume }) => volume !== AUDIO_LEVEL_DEFAULT)
    .sort((a, b) => (a.displayName || a.userId).localeCompare(b.displayName || b.userId));
}

/**
 * @param {string} userId
 * @param {number} value
 * @param {{ displayName?: string }} [options]
 */
export function setUserListenVolume(userId, value, { displayName } = {}) {
  if (!userId) return AUDIO_LEVEL_DEFAULT;
  const volume = clampLevel(value);
  const map = readVolumeMap();

  if (volume === AUDIO_LEVEL_DEFAULT) {
    delete map[userId];
  } else {
    const prev = map[userId] || {};
    map[userId] = {
      v: volume,
      ...(displayName?.trim() ? { n: displayName.trim() } : prev.n ? { n: prev.n } : {}),
    };
  }

  writeVolumeMap(map);
  window.dispatchEvent(new CustomEvent(PTT_SETTINGS_CHANGED, {
    detail: { key: USER_LISTEN_VOLUMES_KEY, userId, value: volume },
  }));
  return volume;
}

export function clearUserListenVolume(userId) {
  if (!userId) return;
  const map = readVolumeMap();
  if (!map[userId]) return;
  delete map[userId];
  writeVolumeMap(map);
  window.dispatchEvent(new CustomEvent(PTT_SETTINGS_CHANGED, {
    detail: { key: USER_LISTEN_VOLUMES_KEY, userId, value: AUDIO_LEVEL_DEFAULT },
  }));
}

/** Agora remote track volume for a speaker. */
export function getUserListenAgoraVolume(userId) {
  return getUserListenVolume(userId);
}

/** HTML Audio element volume (0–1; boost above 100% capped at 1). */
export function getUserListenVolumeRatio(userId) {
  return Math.min(1, getUserListenVolume(userId) / 100);
}

/** Best-effort Firebase user id for a live Agora publisher on a channel. */
export async function resolveLiveSpeakerUserId(channelId, excludeUserId) {
  if (!channelId) return null;
  const cached = getCachedLiveSpeaker(channelId, excludeUserId);
  if (cached) return cached;
  try {
    const signals = await cleanupStalePTTSignals({
      channelId,
      excludeSenderId: excludeUserId,
      limit: 5,
    });
    return signals[0]?.sender_id || null;
  } catch {
    return null;
  }
}

/** Rough localStorage footprint for UI/debug (bytes). */
export function estimateUserListenStorageBytes() {
  if (typeof window === "undefined") return 0;
  try {
    return new Blob([window.localStorage.getItem(USER_LISTEN_VOLUMES_KEY) || ""]).size;
  } catch {
    return 0;
  }
}
