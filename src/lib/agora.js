import { Capacitor } from "@capacitor/core";

/** Firebase channel id → Agora channel name (max 64 chars). */
export function toAgoraChannelName(channelId) {
  if (!channelId) return "";
  const name = `ptc_${channelId}`.replace(/[^a-zA-Z0-9_\-!#$%&()+:;<=.>?@[\]^_{|}~, ]/g, "_");
  return name.slice(0, 64);
}

/**
 * Live audio uses Agora when the Vite app id is present OR we are in the
 * native app. Cloud Agent / Xcode `cap:sync` often omits VITE_AGORA_APP_ID;
 * `getAgoraToken` still returns `app_id`. Without this, iOS falls back to
 * WebM storage-relay which WKWebView cannot play.
 */
export function isAgoraEnabled() {
  if (import.meta.env.VITE_AGORA_DISABLED === "true") return false;
  return Boolean(import.meta.env.VITE_AGORA_APP_ID) || Capacitor.isNativePlatform();
}

export function getAgoraAppId() {
  return import.meta.env.VITE_AGORA_APP_ID || "";
}
