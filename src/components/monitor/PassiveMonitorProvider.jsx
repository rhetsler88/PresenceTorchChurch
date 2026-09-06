import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useChannels from "@/hooks/useChannels";
import { api } from "@/api/client";
import { isAgoraEnabled } from "@/lib/agora";
import {
  canAccessMonitorPage,
  getMonitorChannels,
  getReadableVoiceChannels,
} from "@/lib/userUtils";
import {
  readMutedChannelIds,
  toggleMutedChannelId,
  writeMutedChannelIds,
} from "@/lib/monitorMute";
import useAgoraMultiListen from "@/hooks/useAgoraMultiListen";
import usePttReceiver from "@/hooks/usePttReceiver";
import useBackgroundRelayListen from "@/hooks/useBackgroundRelayListen";
import { playClearTone } from "@/lib/pttTones";
import { maybePlayTextMessageTone, isIncomingVoiceMessage } from "@/lib/textMessageNotifications";
import { hasHeardBroadcast } from "@/lib/heardBroadcasts";
import { recordSessionInteraction } from "@/lib/logoutOnClose";
import { cleanupStalePTTSignals } from "@/lib/pttSignals";
import { recordLivePttSignal } from "@/lib/liveSpeakerRegistry";
import { pttDebugLog } from "@/lib/pttDebugLog";

const PassiveMonitorContext = createContext(null);

const TalkListenRegistrationContext = createContext({
  setTalkListenChannelId: () => {},
});

export function PassiveMonitorProvider({ user, children }) {
  const enabled = canAccessMonitorPage(user);
  const [talkListenChannelId, setTalkListenChannelId] = useState(null);

  const { data: channels = [] } = useChannels({
    enabled: enabled && Boolean(user?.id),
  });

  const monitorChannels = useMemo(
    () => (enabled ? getMonitorChannels(user, channels) : []),
    [enabled, user, channels]
  );

  const readableMonitorChannels = useMemo(
    () => (enabled ? getReadableVoiceChannels(user, monitorChannels) : []),
    [enabled, user, monitorChannels]
  );

  const readableChannelIds = useMemo(
    () => readableMonitorChannels.map((channel) => channel.id).filter(Boolean),
    [readableMonitorChannels]
  );

  const readableChannelKey = readableChannelIds.join(",");

  const [mutedChannelIds, setMutedChannelIds] = useState(() =>
    readMutedChannelIds(user?.id)
  );

  useEffect(() => {
    setMutedChannelIds(readMutedChannelIds(user?.id));
  }, [user?.id]);

  // Drop mutes for channels that are no longer in scope.
  useEffect(() => {
    if (!user?.id || readableChannelIds.length === 0) return;
    setMutedChannelIds((prev) => {
      const allowed = new Set(readableChannelIds);
      const next = new Set([...prev].filter((id) => allowed.has(id)));
      if (next.size === prev.size) return prev;
      writeMutedChannelIds(user.id, next);
      return next;
    });
  }, [user?.id, readableChannelKey, readableChannelIds]);

  const listenChannelIds = useMemo(() => {
    const ids = readableChannelIds.filter((id) => !mutedChannelIds.has(id));
    if (
      talkListenChannelId
      && readableChannelIds.includes(talkListenChannelId)
      && !ids.includes(talkListenChannelId)
    ) {
      return [...ids, talkListenChannelId];
    }
    return ids;
  }, [readableChannelIds, mutedChannelIds, talkListenChannelId]);

  const listenChannelKey = listenChannelIds.join(",");
  const clearToneIds = readableChannelIds;
  const clearToneKey = clearToneIds.join(",");
  const passiveListenActive = enabled && listenChannelIds.length > 0;

  const heardBroadcastsRef = useRef(new Set());
  const agoraEnabled = isAgoraEnabled();

  const { isReceiving: agoraReceiving, heardBroadcastsRef: agoraHeardRef } = useAgoraMultiListen({
    userId: enabled ? user?.id : null,
    channelIds: passiveListenActive && agoraEnabled ? listenChannelIds : [],
  });

  const { isReceiving: relayReceiving, heardBroadcastsRef: relayHeardRef } = usePttReceiver({
    channelIds: passiveListenActive ? listenChannelIds : [],
    userId: user?.id,
    enabled: passiveListenActive,
  });

  useBackgroundRelayListen({
    enabled: passiveListenActive,
    title: "Presence Torch",
    channelCount: listenChannelIds.length,
  });

  const isLiveReceiving = passiveListenActive && (agoraReceiving || relayReceiving);

  // Clear tones for all readable monitor channels (independent of mute / passive listen).
  useEffect(() => {
    if (!enabled || !user?.id || clearToneIds.length === 0) return undefined;

    const unsub = api.entities.PTTSignal.subscribeMany(
      (event) => {
        if (event.data?.sender_id === user.id) return;
        const channelId = event.data?.channel_id;
        if (!clearToneIds.includes(channelId)) return;

        if (event.type === "create") {
          if (event.data?.broadcast_id) {
            heardBroadcastsRef.current.add(event.data.broadcast_id);
          }
          recordLivePttSignal(event.data);
          pttDebugLog("ptt.signal.received", {
            source: "passive-monitor",
            channelId,
            broadcastId: event.data?.broadcast_id ?? null,
          });
          playClearTone(event.data?.broadcast_id);
        }
      },
      clearToneIds.map((channelId) => ({ channel_id: channelId }))
    );

    return unsub;
  }, [enabled, clearToneKey, user?.id, clearToneIds]);

  useEffect(() => {
    if (!enabled || !user?.id) return;
    cleanupStalePTTSignals({
      channelIds: clearToneIds,
      excludeSenderId: user.id,
    })
      .then((active) => {
        for (const signal of active) {
          if (!signal.broadcast_id || !clearToneIds.includes(signal.channel_id)) continue;
          recordLivePttSignal(signal);
          playClearTone(signal.broadcast_id);
        }
      })
      .catch(() => {});
  }, [enabled, clearToneKey, clearToneIds, user?.id]);

  useEffect(() => {
    if (!passiveListenActive || !user?.id || listenChannelIds.length === 0) return undefined;

    const unsub = api.entities.VoiceMessage.subscribeMany(
      (event) => {
        const channelId = event.data?.channel_id;
        if (!listenChannelIds.includes(channelId)) return;
        const heard = heardBroadcastsRef.current;
        maybePlayTextMessageTone(event, user.id, heard);
        // Voice archives are never auto-played — live Agora/relay only.
        if (isIncomingVoiceMessage(event, user.id) && hasHeardBroadcast(event.data?.broadcast_id, heard, relayHeardRef, agoraHeardRef)) {
          return;
        }
      },
      listenChannelIds.map((channelId) => ({ channel_id: channelId }))
    );

    return unsub;
  }, [passiveListenActive, listenChannelKey, listenChannelIds, user?.id]);

  const isMuted = useCallback(
    (channelId) => mutedChannelIds.has(channelId),
    [mutedChannelIds]
  );

  const toggleMute = useCallback(
    (channelId) => {
      if (!user?.id || !channelId) return;
      setMutedChannelIds((prev) => toggleMutedChannelId(user.id, channelId, prev));
      recordSessionInteraction();
    },
    [user?.id]
  );

  const value = useMemo(
    () => ({
      enabled,
      monitorChannels,
      readableMonitorChannels,
      listenChannelIds,
      mutedChannelIds,
      isMuted,
      toggleMute,
      isLiveReceiving,
      heardBroadcastsRef,
      relayHeardRef,
      agoraHeardRef,
    }),
    [
      enabled,
      monitorChannels,
      readableMonitorChannels,
      listenChannelIds,
      mutedChannelIds,
      isMuted,
      toggleMute,
      isLiveReceiving,
      relayHeardRef,
      agoraHeardRef,
    ]
  );

  return (
    <TalkListenRegistrationContext.Provider value={{ setTalkListenChannelId }}>
      <PassiveMonitorContext.Provider value={value}>
        {children}
      </PassiveMonitorContext.Provider>
    </TalkListenRegistrationContext.Provider>
  );
}

export function usePassiveMonitor() {
  return useContext(PassiveMonitorContext);
}

/** Register the active Talk channel so monitor users still hear live audio on Talk. */
export function useMonitorTalkListenRegistration(channelId) {
  const { setTalkListenChannelId } = useContext(TalkListenRegistrationContext);

  useEffect(() => {
    if (!setTalkListenChannelId) return undefined;
    setTalkListenChannelId(channelId || null);
    return () => setTalkListenChannelId(null);
  }, [channelId, setTalkListenChannelId]);
}
