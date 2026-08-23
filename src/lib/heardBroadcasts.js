/**
 * Track broadcasts already heard live so archived voice messages are not played again.
 */

/** @param {Iterable<{ current?: Set<string> } | Set<string> | null | undefined>} refs */
export function markBroadcastHeard(broadcastId, ...refs) {
  if (!broadcastId) return;
  for (const ref of refs) {
    if (!ref) continue;
    if (ref instanceof Set) {
      ref.add(broadcastId);
      continue;
    }
    ref.current?.add(broadcastId);
  }
}

/** @param {Iterable<{ current?: Set<string> } | Set<string> | null | undefined>} refs */
export function hasHeardBroadcast(broadcastId, ...refs) {
  if (!broadcastId) return false;
  for (const ref of refs) {
    if (!ref) continue;
    if (ref instanceof Set) {
      if (ref.has(broadcastId)) return true;
      continue;
    }
    if (ref.current?.has(broadcastId)) return true;
  }
  return false;
}
