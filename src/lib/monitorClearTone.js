/** Whether a passive-monitor clear tone should play for this channel (muted channels stay silent). */
export function shouldPlayClearTone({ channelId, mutedChannelIds }) {
  if (!channelId) return true;
  if (!mutedChannelIds) return true;
  if (mutedChannelIds instanceof Set) {
    return !mutedChannelIds.has(channelId);
  }
  return !new Set(mutedChannelIds).has(channelId);
}
