export function formatActiveChannelsBody(channelCount = 1) {
  const count = Math.max(1, Number(channelCount) || 1);
  return `${count} channel${count === 1 ? "" : "s"} active`;
}
