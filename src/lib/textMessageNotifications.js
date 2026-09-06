import { isProtectionLevelChangeMessage } from "@/lib/protectionLevelHistory";
import { playTextMessageTone } from "@/lib/pttTones";
import { notifyTextMessageInBackground } from "@/lib/pushNotifications";

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
  if (!isIncomingTextMessage(event, userId)) return;

  const broadcastId = event.data?.broadcast_id;
  if (broadcastId && heardBroadcastIds?.has?.(broadcastId)) return;

  playTextMessageTone();
  notifyTextMessageInBackground({
    channelName: event.data?.channel_name || event.data?.channelName || "Channel",
    channelId: event.data?.channel_id || "channel",
  });
}
