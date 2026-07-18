import { useCallback } from "react";
import { isAgoraEnabled } from "@/lib/agora";
import useRelayBroadcast from "./useRelayBroadcast";
import useAgoraPTT from "./useAgoraPTT";

/**
 * PTT broadcast: always record/send via Storage relay (reliable in browser).
 * When Agora is configured, also join as a listener for lower-latency live audio.
 */
export default function usePttBroadcast(options) {
  const agora = useAgoraPTT(options);
  const relay = useRelayBroadcast(options);

  const startRecording = useCallback(async () => {
    return relay.startRecording();
  }, [relay.startRecording]);

  const stopRecording = useCallback(async () => {
    return relay.stopRecording();
  }, [relay.stopRecording]);

  if (isAgoraEnabled()) {
    return {
      isRecording: relay.isRecording,
      startRecording,
      stopRecording,
      isLiveReceiving: agora.isReceiving || false,
      isChannelReady: true,
      heardBroadcastsRef: relay.heardBroadcastsRef,
      transport: "relay+agora-listen",
    };
  }

  return {
    isRecording: relay.isRecording,
    startRecording,
    stopRecording,
    isLiveReceiving: false,
    isChannelReady: true,
    heardBroadcastsRef: relay.heardBroadcastsRef,
    transport: "storage",
  };
}
