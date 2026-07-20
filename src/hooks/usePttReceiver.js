import { isAgoraEnabled } from "@/lib/agora";
import useRelayReceiver from "./useRelayReceiver";
import useMonitorRelayReceiver from "./useMonitorRelayReceiver";

/**
 * Live PTT receive path via Storage relay (no idle Agora connections).
 * Talk: pass channelId. Monitor: pass channelIds.
 * Agora live audio is handled lazily by usePttBroadcast on the same channel.
 */
export default function usePttReceiver({ channelId, channelIds, userId, onRemoteTalkStart }) {
  const relay = useRelayReceiver({ channelId, userId });
  const monitorRelay = useMonitorRelayReceiver({
    userId,
    channelIds: channelIds || [],
  });

  if (channelIds?.length) {
    return {
      isReceiving: monitorRelay.isReceiving,
      heardBroadcastsRef: monitorRelay.heardBroadcastsRef,
      transport: isAgoraEnabled() ? "relay" : "storage",
    };
  }

  return {
    isReceiving: relay.isReceiving,
    heardBroadcastsRef: relay.heardBroadcastsRef,
    transport: isAgoraEnabled() ? "relay" : "storage",
  };
}
