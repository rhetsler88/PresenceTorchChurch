/**
 * Split monitor broadcast targets into channels that are free vs already busy on PTT.
 * @returns {{ freeIds: string[], busyIds: string[] }}
 */
export function partitionBroadcastTargets(activeTargetIds, busyChannelIds) {
  const freeIds = [];
  const busyIds = [];
  const busySet =
    busyChannelIds instanceof Set
      ? busyChannelIds
      : new Set(busyChannelIds ?? []);

  for (const id of activeTargetIds ?? []) {
    if (busySet.has(id)) busyIds.push(id);
    else freeIds.push(id);
  }

  return { freeIds, busyIds };
}
