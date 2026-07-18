import { useRef, useCallback } from "react";
import { isAgoraEnabled } from "@/lib/agora";
import useRelayBroadcast from "./useRelayBroadcast";
import useAgoraPTT from "./useAgoraPTT";

/**
 * PTT broadcast: prefer Agora WebRTC when configured, fall back to Storage relay
 * if Agora join/publish fails so PTT still works in the browser.
 */
export default function usePttBroadcast(options) {
  const agora = useAgoraPTT(options);
  const relay = useRelayBroadcast(options);
  const transportRef = useRef(null);
  const heardBroadcastsRef = useRef(new Set());

  const startRecording = useCallback(async () => {
    if (isAgoraEnabled()) {
      const agoraOk = await agora.startRecording();
      if (agoraOk) {
        transportRef.current = "agora";
        agora.heardBroadcastsRef.current.forEach((id) => heardBroadcastsRef.current.add(id));
        return true;
      }
      console.warn("Agora PTT unavailable — falling back to storage relay");
    }

    const relayOk = await relay.startRecording();
    if (relayOk) {
      transportRef.current = "storage";
      relay.heardBroadcastsRef.current.forEach((id) => heardBroadcastsRef.current.add(id));
    } else {
      transportRef.current = null;
    }
    return relayOk;
  }, [agora.startRecording, relay.startRecording, agora.heardBroadcastsRef, relay.heardBroadcastsRef]);

  const stopRecording = useCallback(async () => {
    const transport = transportRef.current;
    transportRef.current = null;
    if (transport === "agora") return agora.stopRecording();
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
      transport: "agora",
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
