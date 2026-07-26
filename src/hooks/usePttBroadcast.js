import { useCallback, useRef, useState } from "react";
import { isAgoraEnabled } from "@/lib/agora";
import useRelayBroadcast from "./useRelayBroadcast";
import useAgoraPTT from "./useAgoraPTT";
import useAgoraMultiPublish from "./useAgoraMultiPublish";

/**
 * PTT broadcast: Agora WebRTC for live half-duplex audio when configured.
 * Storage relay is the fallback for transmit and always used when Agora is off.
 * With Agora, relay runs archive-only on the same mic stream for chat messages.
 * Pass publishChannelIds with length > 1 to publish live audio on every channel (broadcast-all).
 */
export default function usePttBroadcast(options) {
  const { listenActive = false, receiveEnabled = listenActive, channelId, userId, userName } = options;
  const agoraEnabled = isAgoraEnabled();
  const agora = useAgoraPTT({ channelId, userId, listenActive, receiveEnabled });
  const agoraMulti = useAgoraMultiPublish({ userId });
  const relay = useRelayBroadcast({ channelId, userId, userName });
  const usingAgoraRef = useRef(false);
  const usingMultiPublishRef = useRef(false);
  const archiveActiveRef = useRef(false);
  const liveActiveRef = useRef(false);
  const [isTransmitting, setIsTransmitting] = useState(false);

  const startArchiveRecording = useCallback(async (stream, broadcastId) => {
    if (!stream) return false;
    let archiveStream = stream;
    try {
      if (typeof stream.clone === "function") {
        archiveStream = stream.clone();
      }
    } catch {
      archiveStream = stream;
    }
    const archiveOk = await relay.startRecording({
      sharedStream: archiveStream,
      archiveOnly: true,
      broadcastId,
      ownsStream: archiveStream !== stream,
    });
    archiveActiveRef.current = archiveOk;
    return archiveOk;
  }, [relay.startRecording]);

  const startRecording = useCallback(async ({ broadcastId: externalBroadcastId, publishChannelIds } = {}) => {
    const publishIds = publishChannelIds?.filter(Boolean)
      ?? (channelId ? [channelId] : []);
    const broadcastId = externalBroadcastId || crypto.randomUUID();

    if (agoraEnabled && publishIds.length > 0) {
      let ok = false;
      let stream = null;

      if (publishIds.length > 1) {
        ok = await agoraMulti.startRecording({ broadcastId, channelIds: publishIds });
        usingMultiPublishRef.current = ok;
        stream = agoraMulti.getMediaStream();
      } else {
        ok = await agora.startRecording({ broadcastId });
        usingMultiPublishRef.current = false;
        stream = agora.getMediaStream();
      }

      if (ok) {
        usingAgoraRef.current = true;
        liveActiveRef.current = true;
        setIsTransmitting(true);
        await startArchiveRecording(stream, broadcastId);
        return true;
      }
    }

    usingAgoraRef.current = false;
    usingMultiPublishRef.current = false;
    archiveActiveRef.current = false;
    const ok = await relay.startRecording();
    if (ok) {
      liveActiveRef.current = true;
      setIsTransmitting(true);
    }
    return ok;
  }, [
    agoraEnabled,
    channelId,
    agora.startRecording,
    agora.getMediaStream,
    agoraMulti.startRecording,
    agoraMulti.getMediaStream,
    relay.startRecording,
    startArchiveRecording,
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
    } else {
      await relay.stopLiveRelay();
    }
  }, [agora.stopRecording, agoraMulti.stopRecording, relay.stopLiveRelay]);

  const stopRecording = useCallback(async () => {
    await stopLiveTransmit();

    if (usingAgoraRef.current) {
      usingAgoraRef.current = false;
      let result = null;

      if (archiveActiveRef.current) {
        result = await relay.stopRecording();
        archiveActiveRef.current = false;
      }

      if (usingMultiPublishRef.current) {
        await agoraMulti.stopRecording({ stopStream: true });
        usingMultiPublishRef.current = false;
      } else {
        await agora.stopRecording({ stopStream: true });
      }

      if (result) return result;
      return null;
    }
    return relay.stopRecording();
  }, [agora.stopRecording, agoraMulti.stopRecording, relay.stopRecording, stopLiveTransmit]);

  if (agoraEnabled) {
    return {
      isRecording: isTransmitting,
      startRecording,
      stopLiveTransmit,
      stopRecording,
      isLiveReceiving: agora.isReceiving,
      isChannelReady: agora.isChannelReady,
      heardBroadcastsRef: agora.heardBroadcastsRef,
      transport: "agora",
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
