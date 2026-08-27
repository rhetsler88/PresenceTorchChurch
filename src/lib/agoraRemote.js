import { api } from "@/api/client";
import { getAgoraAppId, toAgoraChannelName } from "@/lib/agora";
import { getSessionAgoraUid, isSameAgoraUid } from "@/lib/agoraUid";
import { getCachedLiveSpeaker } from "@/lib/liveSpeakerRegistry";
import {
  getUserListenAgoraVolume,
  PTT_SETTINGS_CHANGED,
  USER_LISTEN_VOLUMES_KEY,
} from "@/lib/pttSettings";
import { unlockAudioForPTT } from "@/lib/pttTones";

/** @type {Set<import('agora-rtc-sdk-ng').IRemoteAudioTrack>} */
const activeRemoteTracks = new Set();

/** @type {Map<import('agora-rtc-sdk-ng').IRemoteAudioTrack, string | null>} */
const trackSpeakers = new Map();

/** @type {Map<import('agora-rtc-sdk-ng').IRemoteAudioTrack, string | null>} */
const trackChannels = new Map();

if (typeof window !== "undefined") {
  window.addEventListener(PTT_SETTINGS_CHANGED, (event) => {
    const userId = event.detail?.userId;
    if (userId) {
      refreshRemoteListenVolumes(userId);
      return;
    }
    if (event.detail?.key === USER_LISTEN_VOLUMES_KEY) {
      refreshRemoteListenVolumes();
    }
  });

  window.addEventListener("ptt-live-speaker", (event) => {
    const channelId = event.detail?.channelId;
    const senderId = event.detail?.senderId;
    if (!channelId || !senderId) return;
    for (const track of activeRemoteTracks) {
      if (trackChannels.get(track) === channelId) {
        updateRemoteTrackSpeaker(track, senderId);
      }
    }
  });
}

function applyRemoteListenVolume(audioTrack, speakerUserId) {
  if (!audioTrack?.setVolume) return;
  try {
    audioTrack.setVolume(getUserListenAgoraVolume(speakerUserId));
  } catch (err) {
    console.warn("Agora remote volume apply failed:", err);
  }
}

/** @param {string} [onlyUserId] refresh tracks for one speaker only */
export function refreshRemoteListenVolumes(onlyUserId) {
  for (const track of activeRemoteTracks) {
    const speakerUserId = trackSpeakers.get(track);
    if (onlyUserId && speakerUserId !== onlyUserId) continue;
    applyRemoteListenVolume(track, speakerUserId);
  }
}

function trackRemoteAudio(audioTrack, speakerUserId, channelId) {
  if (!audioTrack) return;
  activeRemoteTracks.add(audioTrack);
  trackSpeakers.set(audioTrack, speakerUserId || null);
  if (channelId) trackChannels.set(audioTrack, channelId);
  applyRemoteListenVolume(audioTrack, speakerUserId);
}

export function updateRemoteTrackSpeaker(audioTrack, speakerUserId) {
  if (!audioTrack || !activeRemoteTracks.has(audioTrack)) return;
  trackSpeakers.set(audioTrack, speakerUserId || null);
  applyRemoteListenVolume(audioTrack, speakerUserId);
}

function untrackRemoteAudio(audioTrack) {
  if (!audioTrack) return;
  activeRemoteTracks.delete(audioTrack);
  trackSpeakers.delete(audioTrack);
  trackChannels.delete(audioTrack);
}

async function resolveSpeakerVolumeLater(audioTrack, channelId, firebaseUserId) {
  if (!audioTrack || !channelId || !firebaseUserId) return;

  let speakerUserId = getCachedLiveSpeaker(channelId, firebaseUserId);
  if (!speakerUserId) {
    try {
      const { resolveLiveSpeakerUserId } = await import("@/lib/pttSettings");
      speakerUserId = await resolveLiveSpeakerUserId(channelId, firebaseUserId);
    } catch {
      return;
    }
  }
  if (speakerUserId) {
    updateRemoteTrackSpeaker(audioTrack, speakerUserId);
  }
}

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

export async function playAgoraRemoteAudio(audioTrack, { speakerUserId, channelId } = {}) {
  if (!audioTrack) return false;
  unlockAudioForPTT();
  try {
    await audioTrack.play();
    trackRemoteAudio(audioTrack, speakerUserId, channelId);
    return true;
  } catch (err) {
    console.warn("Agora remote audio play failed:", err);
    return false;
  }
}

export { untrackRemoteAudio };

export async function subscribeRemoteAudio(
  client,
  remoteUser,
  localUid,
  mediaType = "audio",
  { speakerUserId, channelId, firebaseUserId } = {},
) {
  if (isSameAgoraUid(remoteUser.uid, localUid)) return false;
  if (mediaType !== "audio" && mediaType !== "all") return false;

  const initialSpeaker = speakerUserId
    ?? (channelId && firebaseUserId ? getCachedLiveSpeaker(channelId, firebaseUserId) : null);

  await client.subscribe(remoteUser, mediaType);
  const played = await playAgoraRemoteAudio(remoteUser.audioTrack, {
    speakerUserId: initialSpeaker,
    channelId,
  });

  if (played && channelId && firebaseUserId && !initialSpeaker) {
    void resolveSpeakerVolumeLater(remoteUser.audioTrack, channelId, firebaseUserId);
  }

  return played;
}

/** Subscribe to remote users already publishing when we join mid-transmission. */
export async function subscribeExistingRemoteUsers(
  client,
  localUid,
  onSubscribed,
  { channelId, firebaseUserId } = {},
) {
  for (const remoteUser of client.remoteUsers) {
    if (isSameAgoraUid(remoteUser.uid, localUid) || !remoteUser.hasAudio) continue;
    try {
      const subscribed = await subscribeRemoteAudio(
        client,
        remoteUser,
        localUid,
        "audio",
        { channelId, firebaseUserId },
      );
      if (subscribed) onSubscribed?.(remoteUser);
    } catch (err) {
      console.error("Agora subscribe existing remote failed:", err);
    }
  }
}

export { isSameAgoraUid };
