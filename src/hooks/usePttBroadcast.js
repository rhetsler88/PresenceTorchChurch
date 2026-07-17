import { isAgoraEnabled } from "@/lib/agora";
import useRelayBroadcast from "./useRelayBroadcast";
import useAgoraPTT from "./useAgoraPTT";

/** PTT broadcast: Agora WebRTC when configured, otherwise Firebase Storage relay. */
export default function usePttBroadcast(options) {
  const agora = useAgoraPTT(options);
  const relay = useRelayBroadcast(options);

  if (isAgoraEnabled()) {
    return {
      isRecording: agora.isRecording,
      startRecording: agora.startRecording,
      stopRecording: agora.stopRecording,
      isLiveReceiving: agora.isReceiving,
      isChannelReady: agora.isChannelReady,
      heardBroadcastsRef: agora.heardBroadcastsRef,
      transport: "agora",
    };
  }
  return {
    isRecording: relay.isRecording,
    startRecording: relay.startRecording,
    stopRecording: relay.stopRecording,
    isLiveReceiving: false,
    isChannelReady: true,
    heardBroadcastsRef: { current: new Set() },
    transport: "storage",
  };
}
