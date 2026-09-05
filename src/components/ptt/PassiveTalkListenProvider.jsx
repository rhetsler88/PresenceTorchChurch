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
  canAccessChannel,
  canAccessMonitorPage,
  canReadVoiceMessageForChannel,
} from "@/lib/userUtils";
import useAgoraMultiListen from "@/hooks/useAgoraMultiListen";
import usePttReceiver from "@/hooks/usePttReceiver";
import useBackgroundRelayListen from "@/hooks/useBackgroundRelayListen";
import { playClearTone } from "@/lib/pttTones";
import { maybePlayTextMessageTone, isIncomingVoiceMessage } from "@/lib/textMessageNotifications";
import { hasHeardBroadcast } from "@/lib/heardBroadcasts";
import { cleanupStalePTTSignals } from "@/lib/pttSignals";
import { recordLivePttSignal } from "@/lib/liveSpeakerRegistry";
import { pttDebugLog } from "@/lib/pttDebugLog";

const PassiveTalkListenContext = createContext(null);

function resolveStoredTalkChannelId(user, channels) {
  if (!user?.id || !channels?.length) return null;
  const myChannels = channels.filter((channel) => canAccessChannel(user, channel));
  if (myChannels.length === 0) return null;

  const stored = localStorage.getItem("lastChannelId");
  const fromStorage = stored && myChannels.find((channel) => channel.id === stored);
  const readableFromStorage =
    fromStorage && canReadVoiceMessageForChannel(user, fromStorage)
      ? fromStorage.id
      : null;
  if (readableFromStorage) return readableFromStorage;

  const firstReadable = myChannels.find((channel) =>
    canReadVoiceMessageForChannel(user, channel)
  );
  return firstReadable?.id ?? null;
}

/**
 * App-wide passive listen for users without Monitor access — follows the selected Talk channel
 * on every tab and in the background.
 */
export function PassiveTalkListenProvider({ user, children }) {
  const enabled = Boolean(user?.id) && !canAccessMonitorPage(user);
  const [registration, setRegistration] = useState({
    channelId: null,
    title: "Talk",
    canRead: false,
    listenPaused: false,
  });

  const { data: channels = [] } = useChannels({ enabled });

  const fallbackChannelId = useMemo(
    () => (enabled ? resolveStoredTalkChannelId(user, channels) : null),
    [enabled, user, channels]
  );

  const listenChannelId = registration.canRead
    ? registration.channelId
    : fallbackChannelId;

  const passiveListenActive =
    enabled && Boolean(listenChannelId) && !registration.listenPaused;

  const heardBroadcastsRef = useRef(new Set());
  const agoraEnabled = isAgoraEnabled();

  const { isReceiving: agoraReceiving, heardBroadcastsRef: agoraHeardRef } = useAgoraMultiListen({
    userId: enabled ? user?.id : null,
    channelIds: passiveListenActive && agoraEnabled && listenChannelId ? [listenChannelId] : [],
  });

  const { isReceiving: relayReceiving, heardBroadcastsRef: relayHeardRef } = usePttReceiver({
    channelId: passiveListenActive ? listenChannelId : undefined,
    userId: user?.id,
    enabled: passiveListenActive,
  });

  useBackgroundRelayListen({
    enabled: passiveListenActive,
    title: "Presence Torch",
    channelCount: listenChannelId ? 1 : 0,
  });

  const isLiveReceiving = passiveListenActive && (agoraReceiving || relayReceiving);

  useEffect(() => {
    if (!passiveListenActive || !user?.id || !listenChannelId) return undefined;

    const unsub = api.entities.PTTSignal.subscribe(
      (event) => {
        if (event.data?.sender_id === user.id) return;
        if (event.data?.channel_id !== listenChannelId) return;

        if (event.type === "create") {
          if (event.data?.broadcast_id) {
            heardBroadcastsRef.current.add(event.data.broadcast_id);
          }
          recordLivePttSignal(event.data);
          pttDebugLog("ptt.signal.received", {
            source: "passive-talk",
            channelId: listenChannelId,
            broadcastId: event.data?.broadcast_id ?? null,
          });
          playClearTone(event.data?.broadcast_id);
        }
      },
      { channel_id: listenChannelId }
    );

    return unsub;
  }, [passiveListenActive, listenChannelId, user?.id]);

  useEffect(() => {
    if (!passiveListenActive || !user?.id || !listenChannelId) return;
    cleanupStalePTTSignals({
      channelId: listenChannelId,
      excludeSenderId: user.id,
    }).catch(() => {});
  }, [passiveListenActive, listenChannelId, user?.id]);

  useEffect(() => {
    if (!passiveListenActive || !user?.id || !listenChannelId) return undefined;

    const unsub = api.entities.VoiceMessage.subscribe(
      (event) => {
        if (event.data?.channel_id !== listenChannelId) return;
        maybePlayTextMessageTone(event, user.id, heardBroadcastsRef.current);
        // Voice archives are never auto-played — live Agora/relay only.
        if (isIncomingVoiceMessage(event, user.id) && hasHeardBroadcast(
          event.data?.broadcast_id,
          heardBroadcastsRef,
          relayHeardRef,
          agoraHeardRef
        )) {
          return;
        }
      },
      { channel_id: listenChannelId }
    );

    return unsub;
  }, [passiveListenActive, listenChannelId, user?.id]);

  const setTalkListen = useCallback((next) => {
    setRegistration((prev) => ({
      ...prev,
      ...next,
    }));
  }, []);

  const value = useMemo(
    () => ({
      enabled,
      listenChannelId,
      isLiveReceiving,
      heardBroadcastsRef,
      relayHeardRef,
      agoraHeardRef,
      setTalkListen,
    }),
    [enabled, listenChannelId, isLiveReceiving, relayHeardRef, agoraHeardRef, setTalkListen]
  );

  return (
    <PassiveTalkListenContext.Provider value={value}>
      {children}
    </PassiveTalkListenContext.Provider>
  );
}

export function usePassiveTalkListen() {
  return useContext(PassiveTalkListenContext);
}

export function usePassiveTalkListenRegistration({
  channelId,
  title = "Talk",
  canRead = false,
  listenPaused = false,
  persist = false,
}) {
  const ctx = useContext(PassiveTalkListenContext);

  React.useEffect(() => {
    if (!ctx?.setTalkListen) return undefined;
    ctx.setTalkListen({
      channelId,
      title,
      canRead,
      listenPaused,
    });
    if (persist) return undefined;
    return () => {
      ctx.setTalkListen({ channelId: null, canRead: false, listenPaused: false });
    };
  }, [ctx, channelId, title, canRead, listenPaused, persist]);
}
