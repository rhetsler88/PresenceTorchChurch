import { auth } from "./firebase.js";

/** Re-verify Firestore membership + auth token at most once per channel per minute. */
export const PTT_ACCESS_TTL_MS = 60_000;

/** @type {Map<string, { at: number }>} */
const verifiedAt = new Map();

function cacheKey(userId, channelId) {
  return `${userId}:${channelId || "global"}`;
}

export function invalidatePttAccess(userId, channelId) {
  if (!userId) return;
  verifiedAt.delete(cacheKey(userId, channelId));
  if (!channelId) verifiedAt.delete(cacheKey(userId, "global"));
}

export function invalidateAllPttAccess(userId) {
  if (!userId) return;
  for (const key of verifiedAt.keys()) {
    if (key.startsWith(`${userId}:`)) verifiedAt.delete(key);
  }
}

function isFresh(userId, channelId) {
  const entry = verifiedAt.get(cacheKey(userId, channelId));
  return Boolean(entry && Date.now() - entry.at < PTT_ACCESS_TTL_MS);
}

function markVerified(userId, channelId) {
  verifiedAt.set(cacheKey(userId, channelId), { at: Date.now() });
}

/**
 * Ensures channel membership + ID token are fresh enough for PTT send.
 * Skips work when the same user/channel was verified within PTT_ACCESS_TTL_MS.
 *
 * @param {{
 *   userId: string,
 *   channelId?: string | null,
 *   refreshMembership?: () => Promise<unknown>,
 *   ensureMembership?: () => Promise<unknown>,
 *   force?: boolean,
 * }} options
 */
export async function ensurePttAccess({
  userId,
  channelId = null,
  refreshMembership,
  ensureMembership,
  force = false,
}) {
  if (!userId) return;

  const key = cacheKey(userId, channelId);
  if (!force && isFresh(userId, channelId)) return;

  if (refreshMembership) {
    await refreshMembership();
  }
  if (ensureMembership) {
    await ensureMembership();
  }
  await auth.currentUser?.getIdToken(true);

  markVerified(userId, channelId);
}
