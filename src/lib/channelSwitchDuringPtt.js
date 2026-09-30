/**
 * Decide whether a channel selection should apply now or wait until PTT settles.
 * @returns {{ action: 'none'|'apply'|'defer', channelId?: string|null, pendingId?: string|null }}
 */
export function resolveChannelSwitch({
  requestedId = null,
  currentId = null,
  isTransmitting = false,
  pendingId = null,
  settle = false,
} = {}) {
  if (settle) {
    if (isTransmitting || pendingId == null || pendingId === "") {
      return { action: "none", pendingId: pendingId ?? null };
    }
    return { action: "apply", channelId: pendingId, pendingId: null };
  }

  if (requestedId == null || requestedId === currentId) {
    return { action: "none", pendingId: pendingId ?? null };
  }

  if (isTransmitting) {
    return { action: "defer", pendingId: requestedId };
  }

  return { action: "apply", channelId: requestedId, pendingId: pendingId ?? null };
}
