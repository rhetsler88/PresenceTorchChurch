import { PROTECTION_LEVELS } from "@/components/ptt/ProtectionLevelBadge";
import { api } from "@/api/client";
import { deviceDayKey } from "@/lib/deviceDate";

export const PROTECTION_LEVEL_CHANGE_TYPE = "protection_level_change";

export function isProtectionLevelChangeMessage(message) {
  return message?.message_type === PROTECTION_LEVEL_CHANGE_TYPE;
}

export function formatProtectionLevelLabel(level) {
  const config = PROTECTION_LEVELS[level] || PROTECTION_LEVELS.green;
  return `${config.label} — ${config.desc}`;
}

export function formatProtectionChangeText(fromLevel, toLevel) {
  const from = fromLevel || "green";
  const to = toLevel || "green";
  const fromLabel = formatProtectionLevelLabel(from);
  const toLabel = formatProtectionLevelLabel(to);
  if (from === to) return `Protection level set to ${toLabel}`;
  return `Protection level changed from ${fromLabel} to ${toLabel}`;
}

function invalidateHistoryQueries(queryClient, channelId) {
  if (!queryClient) return;
  queryClient.invalidateQueries({ queryKey: ["messages", channelId] });
  queryClient.invalidateQueries({ queryKey: ["all-messages"] });
  queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
}

async function createProtectionLevelHistoryEntry(channelId, fromLevel, toLevel) {
  const from = fromLevel || "green";
  const to = toLevel || "green";
  const now = new Date();
  return api.entities.VoiceMessage.create({
    channel_id: channelId,
    message_type: PROTECTION_LEVEL_CHANGE_TYPE,
    text_content: formatProtectionChangeText(from, to),
    protection_level: to,
    protection_level_from: from,
    sender_name: "System",
    sender_email: "",
    is_transcribed: true,
    device_time: now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
    device_date: deviceDayKey(now),
  });
}

/** Record a protection level change in Talk and Logs history. */
export async function recordProtectionLevelChange({
  channelId,
  fromLevel,
  toLevel,
  queryClient,
}) {
  const from = fromLevel || "green";
  const to = toLevel || "green";
  if (!channelId || from === to) return null;

  try {
    await api.functions.invoke("recordProtectionLevelHistory", {
      channel_id: channelId,
      from_level: from,
      to_level: to,
    });
  } catch (err) {
    console.warn("recordProtectionLevelHistory callable failed, falling back to client write:", err);
    try {
      await createProtectionLevelHistoryEntry(channelId, from, to);
    } catch (fallbackErr) {
      console.warn("Protection level history fallback write failed:", fallbackErr);
      return null;
    }
  }

  invalidateHistoryQueries(queryClient, channelId);
  return true;
}

/** Log history for every channel whose level actually changes. */
export async function recordProtectionLevelChanges(channels, toLevel, queryClient) {
  const targetLevel = toLevel || "green";
  const changed = (channels || []).filter(
    (channel) => (channel?.protection_level || "green") !== targetLevel
  );

  await Promise.all(
    changed.map((channel) =>
      recordProtectionLevelChange({
        channelId: channel.id,
        fromLevel: channel.protection_level || "green",
        toLevel: targetLevel,
        queryClient,
      })
    )
  );
}
