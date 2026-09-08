import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { isProtectionLevelChangeMessage } from "@/lib/protectionLevelHistory";
import { playTextMessageTone } from "@/lib/pttTones";

const TEXT_MESSAGE_CHANNEL_ID = "text_messages";

let appStateTrackingInstalled = false;
let nativeAppActive = true;

function installAppStateTracking() {
  if (appStateTrackingInstalled || typeof window === "undefined") return;
  appStateTrackingInstalled = true;
  window.addEventListener("pause", () => {
    nativeAppActive = false;
  });
  window.addEventListener("resume", () => {
    nativeAppActive = true;
  });
}

export function isAppInForeground() {
  installAppStateTracking();
  if (!nativeAppActive) return false;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    return false;
  }
  return true;
}

function formatTextMessageBody(channelName) {
  return `New text message in ${channelName || "Channel"}`;
}

export function notificationIdForChannel(channelId) {
  let hash = 0;
  const value = String(channelId || "channel");
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return (hash % 90000) + 10000;
}

export async function showTextMessageTrayNotification({
  channelId,
  channelName,
  body,
} = {}) {
  const title = "Presence Torch";
  const messageBody = body || formatTextMessageBody(channelName);
  const tag = `text_message_${channelId || "channel"}`;

  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notificationIdForChannel(channelId),
            title,
            body: messageBody,
            channelId: TEXT_MESSAGE_CHANNEL_ID,
            sound: "default",
            extra: {
              type: "text_message",
              channelId,
              channelName,
            },
          },
        ],
      });
    } catch {
      /* ignore */
    }
    return;
  }

  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(title, {
        body: messageBody,
        tag,
        renotify: true,
        data: {
          type: "text_message",
          channelId,
          channelName,
        },
      });
    } catch {
      /* ignore */
    }
  }
}

export function isIncomingTextMessage(event, userId) {
  return (
    event?.type === "create"
    && event.data?.text_content
    && !event.data?.audio_url
    && event.data?.created_by_id !== userId
    && !isProtectionLevelChangeMessage(event.data)
  );
}

export function isIncomingVoiceMessage(event, userId) {
  return (
    event?.type === "create"
    && event.data?.audio_url
    && !event.data?.text_content
    && event.data?.created_by_id !== userId
    && !isProtectionLevelChangeMessage(event.data)
  );
}

export function maybePlayTextMessageTone(event, userId, heardBroadcastIds = null) {
  maybeNotifyIncomingTextMessage(event, userId, heardBroadcastIds);
}

/** Foreground: tone. Background: tray notification (FCM also fires when the app is suspended). */
export function maybeNotifyIncomingTextMessage(
  event,
  userId,
  heardBroadcastIds = null,
  { channelName = "" } = {}
) {
  if (!isIncomingTextMessage(event, userId)) return;

  const broadcastId = event.data?.broadcast_id;
  if (broadcastId && heardBroadcastIds?.has?.(broadcastId)) return;

  const resolvedChannelName = channelName || event.data?.channel_name || "Channel";
  const channelId = event.data?.channel_id;

  if (Capacitor.isNativePlatform()) {
    if (isAppInForeground()) {
      playTextMessageTone();
    }
    return;
  }

  if (isAppInForeground()) {
    playTextMessageTone();
    return;
  }

  void showTextMessageTrayNotification({
    channelId,
    channelName: resolvedChannelName,
  });
}
