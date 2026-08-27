import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
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

const PassiveMonitorContext = createContext(null);

export function PassiveMonitorProvider({ user, children }) {
  const enabled = canAccessMonitorPage(user);

  const { data: channels = [] } = useQuery({
    queryKey: ["channels"],
    queryFn: () => api.entities.Channel.list("-created_date", 50),
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

  const listenChannelIds = useMemo(
    () => readableChannelIds.filter((id) => !mutedChannelIds.has(id)),
    [readableChannelIds, mutedChannelIds]
  );

  const listenChannelKey = listenChannelIds.join(",");
  const passiveListenActive = enabled && listenChannelIds.length > 0;

  const heardBroadcastsRef = useRef(new Set());
  const agoraEnabled = isAgoraEnabled();

  const { isReceiving: agoraReceiving, heardBroadcastsRef: agoraHeardRef } = useAgoraMultiListen({
    userId: enabled ? user?.id : null,
    channelIds: passiveListenActive && agoraEnabled ? listenChannelIds : [],
    onRemoteTalkStart: (_channelId, _uid) => {},
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

  // Clear tones + heard tracking for unmuted channels on every tab.
  useEffect(() => {
    if (!passiveListenActive || !user?.id) return undefined;

    const unsub = api.entities.PTTSignal.subscribeMany(
      (event) => {
        if (event.data?.sender_id === user.id) return;
        const channelId = event.data?.channel_id;
        if (!listenChannelIds.includes(channelId)) return;

        if (event.type === "create") {
          if (event.data?.broadcast_id) {
            heardBroadcastsRef.current.add(event.data.broadcast_id);
          }
          recordLivePttSignal(event.data);
          if (!agoraEnabled) {
            playClearTone(event.data?.broadcast_id);
          }
        }
      },
      listenChannelIds.map((channelId) => ({ channel_id: channelId }))
    );

    return unsub;
  }, [passiveListenActive, listenChannelKey, user?.id, listenChannelIds]);

  useEffect(() => {
    if (!passiveListenActive || !user?.id) return;
    cleanupStalePTTSignals({
      channelIds: listenChannelIds,
      excludeSenderId: user.id,
    }).catch(() => {});
  }, [passiveListenActive, listenChannelKey, listenChannelIds, user?.id]);

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
    <PassiveMonitorContext.Provider value={value}>
      {children}
    </PassiveMonitorContext.Provider>
  );
}

export function usePassiveMonitor() {
  return useContext(PassiveMonitorContext);
}
