import { useCallback, useRef, useState } from "react";
import { isAgoraEnabled } from "@/lib/agora";
import useRelayBroadcast from "./useRelayBroadcast";
import useAgoraPTT from "./useAgoraPTT";
import useAgoraMultiPublish from "./useAgoraMultiPublish";

/**
 * PTT broadcast: Storage relay is the source of truth for live chunks and chat archive.
 * When Agora is configured, also publish the same mic stream over WebRTC for lower latency.
 * Pass publishChannelIds with length > 1 to publish live audio on every channel (broadcast-all).
 */
export default function usePttBroadcast(options) {
  const {
    listenActive = false,
    receiveEnabled = listenActive,
    channelId,
    userId,
    userName,
    onRemoteLiveAudio,
  } = options;
  const agoraEnabled = isAgoraEnabled();
  const agoraMulti = useAgoraMultiPublish({ userId });
  const relay = useRelayBroadcast({ channelId, userId, userName });
  const usingAgoraRef = useRef(false);
  const usingMultiPublishRef = useRef(false);
  const relayActiveRef = useRef(false);
  const liveActiveRef = useRef(false);
  const [isTransmitting, setIsTransmitting] = useState(false);

  const agora = useAgoraPTT({
    channelId,
    userId,
    listenActive,
    receiveEnabled,
    onRemoteLiveAudio,
  });

  const startRecording = useCallback(async ({ broadcastId: externalBroadcastId, publishChannelIds } = {}) => {
    const publishIds = publishChannelIds?.filter(Boolean)
      ?? (channelId ? [channelId] : []);
    const broadcastId = externalBroadcastId || crypto.randomUUID();

    const relayOk = await relay.startRecording({ broadcastId });
    if (!relayOk) return false;

    relayActiveRef.current = true;
    liveActiveRef.current = true;
    setIsTransmitting(true);
    usingAgoraRef.current = false;
    usingMultiPublishRef.current = false;

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
          console.warn("Agora publish failed; relay live audio still active:", err);
        }
      }
    }

    return true;
  }, [
    agoraEnabled,
    channelId,
    agora.startRecording,
    agoraMulti.startRecording,
    relay.startRecording,
    relay.getMediaStream,
  ]);

  const stopLiveTransmit = useCallback(async () => {
    if (!liveActiveRef.current) return;
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
