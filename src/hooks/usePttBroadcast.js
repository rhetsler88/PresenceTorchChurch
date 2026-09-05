import { useCallback, useEffect, useRef, useState } from "react";
import { isAgoraEnabled } from "@/lib/agora";
import { armPttMaxTransmission, clearPttMaxTransmission } from "@/lib/pttLimits";
import useRelayBroadcast from "./useRelayBroadcast";
import useAgoraPTT from "./useAgoraPTT";
import useAgoraMultiPublish from "./useAgoraMultiPublish";
import { pttDebugLog } from "@/lib/pttDebugLog";

/**
 * PTT broadcast: Firebase relay archives every transmission; live chunks only when Agora is off.
 * When Agora is configured, publish the same mic stream over WebRTC (archive-only relay).
 * Pass publishChannelIds with length > 1 to publish live audio on every channel (broadcast-all).
 */
export default function usePttBroadcast(options) {
  const {
    listenActive = false,
    receiveEnabled = listenActive,
    warmJoin = false,
    warmPublishChannelIds = [],
    channelId,
    userId,
    userName,
    onRemoteLiveAudio,
    onMaxDurationRef,
  } = options;
  const agoraEnabled = isAgoraEnabled();
  const maxDurationTimerRef = useRef(null);
  const agoraMulti = useAgoraMultiPublish({ userId });
  const relay = useRelayBroadcast({ channelId, userId, userName });
  const usingAgoraRef = useRef(false);
  const usingMultiPublishRef = useRef(false);
  const relayActiveRef = useRef(false);
  const liveActiveRef = useRef(false);
  const [isTransmitting, setIsTransmitting] = useState(false);

  const shouldWarmSingleChannel = warmJoin && agoraEnabled && Boolean(channelId);

  const agora = useAgoraPTT({
    channelId,
    userId,
    listenActive,
    warmJoin: shouldWarmSingleChannel,
    receiveEnabled,
    onRemoteLiveAudio,
  });

  const warmPublishKey = warmPublishChannelIds.filter(Boolean).sort().join(",");

  useEffect(() => {
    if (!agoraEnabled || !userId) return undefined;
    const ids = warmPublishChannelIds.filter(Boolean);
    if (ids.length <= 1) return undefined;

    const timer = setTimeout(() => {
      void agoraMulti.warmJoinChannels(ids);
    }, 200);

    return () => clearTimeout(timer);
  }, [agoraEnabled, userId, warmPublishKey, agoraMulti.warmJoinChannels]);

  useEffect(() => () => {
    clearPttMaxTransmission(maxDurationTimerRef);
  }, []);

  const startRecording = useCallback(async ({ broadcastId: externalBroadcastId, publishChannelIds } = {}) => {
    const publishIds = publishChannelIds?.filter(Boolean)
      ?? (channelId ? [channelId] : []);
    const broadcastId = externalBroadcastId || crypto.randomUUID();

    pttDebugLog("broadcast.start", {
      broadcastId,
      channelId,
      publishChannelIds: publishIds,
      agoraEnabled,
    });

    const useArchiveOnly = agoraEnabled && publishIds.length > 0;
    const agoraReadyPromise = agoraEnabled && publishIds.length === 1
      ? agora.ensureJoined()
      : null;
    const multiWarmPromise = agoraEnabled && publishIds.length > 1
      ? agoraMulti.warmJoinChannels(publishIds)
      : null;

    const relayOk = await Promise.all([
      relay.startRecording({ broadcastId, archiveOnly: useArchiveOnly }),
      agoraReadyPromise?.catch(() => null) ?? Promise.resolve(null),
      multiWarmPromise?.catch(() => null) ?? Promise.resolve(null),
    ]).then(([started]) => started);

    if (!relayOk) {
      pttDebugLog("broadcast.mic-denied", { broadcastId });
      return false;
    }

    pttDebugLog("broadcast.mic-live", { broadcastId, publishChannelIds: publishIds });

    relayActiveRef.current = true;
    liveActiveRef.current = true;
    setIsTransmitting(true);
    usingAgoraRef.current = false;
    usingMultiPublishRef.current = false;

    // Arm cutoff as soon as the mic is live — not after Agora publish (can take several seconds).
    armPttMaxTransmission(maxDurationTimerRef, () => {
      onMaxDurationRef?.current?.();
    }, { broadcastId, channelId, publishChannelIds: publishIds });

    if (agoraEnabled && publishIds.length > 0) {
      const stream = relay.getMediaStream();
      if (stream) {
        try {
          if (publishIds.length > 1) {
            const ok = await agoraMulti.startRecording({
              broadcastId,
              channelIds: publishIds,
              sharedStream: stream,
            });
            usingMultiPublishRef.current = ok;
            usingAgoraRef.current = ok;
          } else {
            const ok = await agora.startRecording({
              broadcastId,
              sharedStream: stream,
            });
            usingAgoraRef.current = ok;
          }
        } catch (err) {
          console.warn("Agora publish failed:", err);
        }
        if (!usingAgoraRef.current) {
          pttDebugLog("broadcast.agora-fallback-relay", { broadcastId });
          relay.enableLiveRelay();
        } else {
          pttDebugLog("broadcast.agora-live", {
            broadcastId,
            multi: usingMultiPublishRef.current,
          });
        }
      }
    }

    pttDebugLog("broadcast.ready", { broadcastId });
    return true;
  }, [
    agoraEnabled,
    channelId,
    agora.ensureJoined,
    agora.startRecording,
    agoraMulti.startRecording,
    agoraMulti.warmJoinChannels,
    relay.startRecording,
    relay.getMediaStream,
    relay.enableLiveRelay,
    onMaxDurationRef,
  ]);

  const stopLiveTransmit = useCallback(async () => {
    clearPttMaxTransmission(maxDurationTimerRef);
    if (!liveActiveRef.current) return;
    pttDebugLog("broadcast.stop-live", {});
    liveActiveRef.current = false;
    setIsTransmitting(false);

    if (usingAgoraRef.current) {
      if (usingMultiPublishRef.current) {
        await agoraMulti.stopRecording({ stopStream: false });
      } else {
        await agora.stopRecording({ stopStream: false });
      }
      usingAgoraRef.current = false;
      usingMultiPublishRef.current = false;
    }

    if (relayActiveRef.current) {
      await relay.stopLiveRelay();
    }
  }, [agora.stopRecording, agoraMulti.stopRecording, relay.stopLiveRelay]);

  const stopRecording = useCallback(async () => {
    clearPttMaxTransmission(maxDurationTimerRef);
    await stopLiveTransmit();

    if (!relayActiveRef.current) return null;

    relayActiveRef.current = false;
    return relay.stopRecording();
  }, [relay.stopRecording, stopLiveTransmit]);

  if (agoraEnabled) {
    return {
      isRecording: isTransmitting,
      startRecording,
      stopLiveTransmit,
      stopRecording,
      isLiveReceiving: agora.isReceiving,
      isChannelReady: agora.isChannelReady,
      heardBroadcastsRef: relay.heardBroadcastsRef,
      transport: "relay+agora",
    };
  }

  return {
    isRecording: isTransmitting,
    startRecording,
    stopLiveTransmit,
    stopRecording,
    isLiveReceiving: false,
    isChannelReady: true,
    heardBroadcastsRef: relay.heardBroadcastsRef,
    transport: "storage",
  };
}
