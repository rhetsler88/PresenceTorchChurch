import { useCallback } from "react";
import { isAgoraEnabled } from "@/lib/agora";
import useRelayBroadcast from "./useRelayBroadcast";
import useAgoraPTT from "./useAgoraPTT";

/**
 * PTT broadcast: always record/send via Storage relay (reliable in browser).
 * When Agora is configured, optionally join as a listener for lower-latency live audio.
 * Relay is the source of truth — Agora must never be the only transmit path.
 */
export default function usePttBroadcast(options) {
  const { listenActive = false, ...agoraOptions } = options;
  const agora = useAgoraPTT({ ...agoraOptions, listenActive });
  const relay = useRelayBroadcast(agoraOptions);

  const startRecording = useCallback(async () => {
    return relay.startRecording();
  }, [relay.startRecording]);

  const stopRecording = useCallback(async () => {
    return relay.stopRecording();
  }, [relay.stopRecording]);

  const heardBroadcastsRef = relay.heardBroadcastsRef;

  if (isAgoraEnabled()) {
    return {
      isRecording: relay.isRecording,
      startRecording,
      stopRecording,
      isLiveReceiving: agora.isReceiving || false,
      isChannelReady: agora.isChannelReady,
      heardBroadcastsRef,
      transport: "relay+agora-listen",
    };
  }

  return {
    isRecording: relay.isRecording,
    startRecording,
    stopRecording,
    isLiveReceiving: false,
    isChannelReady: true,
    heardBroadcastsRef,
    transport: "storage",
  };
}
