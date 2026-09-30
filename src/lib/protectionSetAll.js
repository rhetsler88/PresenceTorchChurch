import { api } from "@/api/client";
import { recordProtectionLevelChanges } from "@/lib/protectionLevelHistory";
import { protectionSetAllTargets } from "./protectionSetAllCore.js";

export { protectionSetAllTargets } from "./protectionSetAllCore.js";

/** Per-channel updates — entity updateMany ignores filters and would touch every channel. */
export async function applyBulkProtectionLevelUpdate({
  channels,
  user,
  level,
  queryClient,
}) {
  const targetIds = protectionSetAllTargets(channels, user);
  if (targetIds.length === 0) {
    return { targetIds: [], targetChannels: [] };
  }

  const idSet = new Set(targetIds);
  const targetChannels = (channels || []).filter((c) => idSet.has(c.id));

  await Promise.all(
    targetIds.map((id) => api.entities.Channel.update(id, { protection_level: level }))
  );
  await recordProtectionLevelChanges(targetChannels, level, queryClient);

  return { targetIds, targetChannels };
}
