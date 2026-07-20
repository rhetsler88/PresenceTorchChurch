import { useCallback, useRef } from "react";
import { isAgoraEnabled } from "@/lib/agora";
import useRelayBroadcast from "./useRelayBroadcast";
import useAgoraPTT from "./useAgoraPTT";

/**
 * PTT broadcast: Agora WebRTC when configured (live publish + listen),
 * with Storage relay as fallback if Agora join/publish fails.
 */
export default function usePttBroadcast(options) {
  const agora = useAgoraPTT(options);
  const relay = useRelayBroadcast(options);
  const usingRelayRef = useRef(false);
  const heardBroadcastsRef = useRef({
    has(id) {
      return agora.heardBroadcastsRef.current.has(id) || relay.heardBroadcastsRef.current.has(id);
    },
    add(id) {
      agora.heardBroadcastsRef.current.add(id);
      relay.heardBroadcastsRef.current.add(id);
    },
  });

  const startRecording = useCallback(async () => {
    usingRelayRef.current = false;
    if (isAgoraEnabled()) {
      const ok = await agora.startRecording();
      if (ok) return true;
    }
    usingRelayRef.current = true;
    return relay.startRecording();
  }, [agora.startRecording, relay.startRecording]);

  const stopRecording = useCallback(async () => {
    if (usingRelayRef.current) {
      usingRelayRef.current = false;
      return relay.stopRecording();
    }
    // Prefer Agora when enabled — useAgoraPTT tracks activeRef internally; React
    // isRecording can be stale if PTT is released before the next render.
    if (isAgoraEnabled()) {
      const agoraResult = await agora.stopRecording();
      if (agoraResult) return agoraResult;
    }
    return relay.stopRecording();
  }, [agora.stopRecording, relay.stopRecording]);

  if (isAgoraEnabled()) {
    return {
      isRecording: agora.isRecording || relay.isRecording,
      startRecording,
      stopRecording,
      isLiveReceiving: agora.isReceiving || false,
      isChannelReady: agora.isChannelReady,
      heardBroadcastsRef,
      transport: "agora+relay-fallback",
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
