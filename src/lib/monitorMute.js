const storageKey = (userId) => `ptc_monitor_muted:${userId}`;

export function readMutedChannelIds(userId) {
  if (!userId || typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

export function writeMutedChannelIds(userId, mutedIds) {
  if (!userId || typeof localStorage === "undefined") return;
  localStorage.setItem(storageKey(userId), JSON.stringify([...mutedIds]));
}

export function toggleMutedChannelId(userId, channelId, mutedIds) {
  const next = new Set(mutedIds);
  if (next.has(channelId)) next.delete(channelId);
  else next.add(channelId);
  writeMutedChannelIds(userId, next);
  return next;
}
