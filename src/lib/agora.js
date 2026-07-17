/** Firebase channel id → Agora channel name (max 64 chars). */
export function toAgoraChannelName(channelId) {
  if (!channelId) return "";
  const name = `ptc_${channelId}`.replace(/[^a-zA-Z0-9_\-!#$%&()+:;<=.>?@[\]^_{|}~, ]/g, "_");
  return name.slice(0, 64);
}

export function isAgoraEnabled() {
  return Boolean(import.meta.env.VITE_AGORA_APP_ID);
}

export function getAgoraAppId() {
  return import.meta.env.VITE_AGORA_APP_ID || "";
}
