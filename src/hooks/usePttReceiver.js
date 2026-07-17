import { isAgoraEnabled } from "@/lib/agora";
import useRelayReceiver from "./useRelayReceiver";
import useMonitorRelayReceiver from "./useMonitorRelayReceiver";
import useAgoraMultiListen from "./useAgoraMultiListen";

/**
 * Live PTT receive path.
 * Talk: pass channelId. Monitor: pass channelIds.
 * When Agora is enabled on Talk, receive is handled by usePttBroadcast instead.
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
      isReceiving: false,
      heardBroadcastsRef: { current: new Set() },
      transport: "agora",
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
