import { isAgoraEnabled } from "@/lib/agora";
import useRelayReceiver from "./useRelayReceiver";
import useMonitorRelayReceiver from "./useMonitorRelayReceiver";
import useAgoraMultiListen from "./useAgoraMultiListen";

/**
 * Live PTT receive path.
 * Talk: pass channelId. Monitor: pass channelIds.
 * When Agora is enabled, Agora is primary; storage relay is kept active on Talk
 * so relay-fallback broadcasts are still heard live.
 * @param {{ channelId?: string, channelIds?: string[], userId?: string, onRemoteTalkStart?: () => void }} options
 */
export default function usePttReceiver({ channelId, channelIds, userId, onRemoteTalkStart }) {
  const relay = useRelayReceiver({ channelId, userId });
  const monitorRelay = useMonitorRelayReceiver({
    userId,
    channelIds: channelIds || [],
  });
  const listenIds = isAgoraEnabled() && channelIds?.length ? channelIds : [];
  const multi = useAgoraMultiListen({
    userId,
    channelIds: listenIds,
    onRemoteTalkStart,
  });

  if (isAgoraEnabled()) {
    if (channelIds?.length) {
      return {
        isReceiving: multi.isReceiving,
        heardBroadcastsRef: multi.heardBroadcastsRef,
        transport: "agora",
      };
    }
    return {
      isReceiving: relay.isReceiving,
      heardBroadcastsRef: relay.heardBroadcastsRef,
      transport: "agora+relay",
    };
  }

  if (channelIds?.length) {
    return {
      isReceiving: monitorRelay.isReceiving,
      heardBroadcastsRef: monitorRelay.heardBroadcastsRef,
      transport: "storage",
    };
  }

  return {
    isReceiving: relay.isReceiving,
    heardBroadcastsRef: relay.heardBroadcastsRef,
    transport: "storage",
  };
}
