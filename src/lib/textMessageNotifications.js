import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { isProtectionLevelChangeMessage } from "@/lib/protectionLevelHistory";
import { playTextMessageTone } from "@/lib/pttTones";
import { toast } from "@/lib/toast";

const TEXT_MESSAGE_CHANNEL_ID = "text_messages";

/** Per-channel unread tally for in-app banners while the app is open (Firestore live path). */
const foregroundUnreadByChannel = new Map();

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

export function formatTextMessageBody(count, channelName) {
  const safeCount = Number.parseInt(String(count ?? "1"), 10);
  const normalizedCount = Number.isFinite(safeCount) && safeCount > 0 ? safeCount : 1;
  const label = normalizedCount === 1 ? "text message" : "text messages";
  return `${normalizedCount} new ${label} in ${channelName || "Channel"}`;
}

export function resetForegroundTextMessageUnreadCounts() {
  foregroundUnreadByChannel.clear();
}

function bumpForegroundUnread(channelId) {
  const key = String(channelId || "channel");
  const next = (foregroundUnreadByChannel.get(key) || 0) + 1;
  foregroundUnreadByChannel.set(key, next);
  return next;
}

/** Keep in sync with BackgroundAudioService.FOREGROUND_LISTEN_NOTIFICATION_ID (41001). */
const ANDROID_BACKGROUND_LISTEN_NOTIFICATION_ID = 41001;

export function notificationIdForChannel(channelId) {
  let hash = 0;
  const value = String(channelId || "channel");
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  let id = (hash % 90000) + 10000;
  if (id === ANDROID_BACKGROUND_LISTEN_NOTIFICATION_ID) {
    id += 1;
  }
  return id;
}

export async function showTextMessageTrayNotification({
  channelId,
  channelName,
  body,
  count,
} = {}) {
  const title = "Presence Torch";
  const messageBody = body || formatTextMessageBody(count ?? 1, channelName);
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
              unreadCount: String(count ?? 1),
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

/** In-app banner + optional tray notification while the user is actively using the app. */
export async function showForegroundTextMessageAlert({
  channelId,
  channelName,
  count,
} = {}) {
  const body = formatTextMessageBody(count, channelName);
  playTextMessageTone();
  toast.info(body, { duration: 5000 });
  if (Capacitor.isNativePlatform()) {
    await showTextMessageTrayNotification({
      channelId,
      channelName,
      body,
      count,
    });
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

/** Foreground: on-screen alert with unread count. Background: tray notification. */
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

  if (isAppInForeground()) {
    const count = bumpForegroundUnread(channelId);
    void showForegroundTextMessageAlert({
      channelId,
      channelName: resolvedChannelName,
      count,
    });
    return;
  }

  void showTextMessageTrayNotification({
    channelId,
    channelName: resolvedChannelName,
    count: 1,
  });
}
