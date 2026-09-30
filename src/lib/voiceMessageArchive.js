import { api } from "@/api/client";
import { deviceDayKey } from "@/lib/deviceDate";
import { getDisplayName } from "@/lib/userUtils";
import { assertPlayableSendPayload } from "@/lib/playableSendPayload";

/** Create a Firestore voice log entry from a finalized recording upload. */
export async function createVoiceMessageArchive({ channelId, user, result }) {
  const { file_url, duration, broadcast_id } = assertPlayableSendPayload(result);
  const now = new Date();
  return api.entities.VoiceMessage.create({
    channel_id: channelId,
    sender_id: user.id,
    sender_name: getDisplayName(user),
    sender_email: user.email || "",
    audio_url: file_url,
    duration_seconds: Math.round(duration * 10) / 10,
    is_transcribed: false,
    device_time: now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
    device_date: deviceDayKey(now),
    broadcast_id,
  });
}
