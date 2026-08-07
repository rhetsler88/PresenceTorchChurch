import { api } from "@/api/client";
import { getAgoraAppId, toAgoraChannelName } from "@/lib/agora";
import { getSessionAgoraUid, isSameAgoraUid } from "@/lib/agoraUid";
import { unlockAudioForPTT } from "@/lib/pttTones";

export async function fetchAgoraCredentials(channelId, userId) {
  const clientUid = getSessionAgoraUid(userId);
  /** @type {any} */
  const data = await api.functions.invoke("getAgoraToken", {
    channel_id: channelId,
    client_uid: clientUid,
  });
  return {
    appId: data.app_id || getAgoraAppId(),
    token: data.token,
    channelName: data.channel_name || toAgoraChannelName(channelId),
    uid: typeof data.uid === "number" ? data.uid : clientUid,
  };
}

export async function playAgoraRemoteAudio(audioTrack) {
  if (!audioTrack) return false;
  unlockAudioForPTT();
  try {
    await audioTrack.play();
    return true;
  } catch (err) {
    console.warn("Agora remote audio play failed:", err);
    return false;
  }
}

export async function subscribeRemoteAudio(client, remoteUser, localUid, mediaType = "audio") {
  if (isSameAgoraUid(remoteUser.uid, localUid)) return false;
  if (mediaType !== "audio" && mediaType !== "all") return false;

  await client.subscribe(remoteUser, mediaType);
  return playAgoraRemoteAudio(remoteUser.audioTrack);
}

/** Subscribe to remote users already publishing when we join mid-transmission. */
export async function subscribeExistingRemoteUsers(client, localUid, onSubscribed) {
  for (const remoteUser of client.remoteUsers) {
    if (isSameAgoraUid(remoteUser.uid, localUid) || !remoteUser.hasAudio) continue;
    try {
      const subscribed = await subscribeRemoteAudio(client, remoteUser, localUid, "audio");
      if (subscribed) onSubscribed?.(remoteUser);
    } catch (err) {
      console.error("Agora subscribe existing remote failed:", err);
    }
  }
}

export { isSameAgoraUid };
