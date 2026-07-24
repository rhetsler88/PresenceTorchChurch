import { useCallback, useRef, useState } from "react";
import { isAgoraEnabled } from "@/lib/agora";
import useRelayBroadcast from "./useRelayBroadcast";
import useAgoraPTT from "./useAgoraPTT";

/**
 * PTT broadcast: Agora WebRTC for live half-duplex audio when configured.
 * Storage relay is the fallback for transmit and always used when Agora is off.
 * With Agora, relay runs archive-only on the same mic stream for chat messages.
 */
export default function usePttBroadcast(options) {
  const { listenActive = false, ...sharedOptions } = options;
  const agoraEnabled = isAgoraEnabled();
  const agora = useAgoraPTT({ ...sharedOptions, listenActive });
  const relay = useRelayBroadcast(sharedOptions);
  const usingAgoraRef = useRef(false);
  const archiveActiveRef = useRef(false);
  const liveActiveRef = useRef(false);
  const [isTransmitting, setIsTransmitting] = useState(false);

  const startRecording = useCallback(async () => {
    if (agoraEnabled) {
      const broadcastId = crypto.randomUUID();
      const ok = await agora.startRecording({ broadcastId });
      if (ok) {
        usingAgoraRef.current = true;
        liveActiveRef.current = true;
        setIsTransmitting(true);
        const stream = agora.getMediaStream();
        if (stream) {
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
        }
        return true;
      }
    }
    usingAgoraRef.current = false;
    archiveActiveRef.current = false;
    const ok = await relay.startRecording();
    if (ok) {
      liveActiveRef.current = true;
      setIsTransmitting(true);
    }
    return ok;
  }, [agoraEnabled, agora.startRecording, agora.getMediaStream, relay.startRecording]);

  const stopLiveTransmit = useCallback(async () => {
    if (!liveActiveRef.current) return;
    liveActiveRef.current = false;
    setIsTransmitting(false);

    if (usingAgoraRef.current) {
      await agora.stopRecording({ stopStream: false });
    } else {
      await relay.stopLiveRelay();
    }
  }, [agora.stopRecording, relay.stopLiveRelay]);

  const stopRecording = useCallback(async () => {
    await stopLiveTransmit();

    if (usingAgoraRef.current) {
      usingAgoraRef.current = false;
      let result = null;

      if (archiveActiveRef.current) {
        result = await relay.stopRecording();
        archiveActiveRef.current = false;
      }

      await agora.stopRecording({ stopStream: true });

      if (result) return result;
      return null;
    }
    return relay.stopRecording();
  }, [agora.stopRecording, relay.stopRecording, stopLiveTransmit]);

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
