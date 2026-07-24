import { isAgoraEnabled } from "@/lib/agora";
import useRelayReceiver from "./useRelayReceiver";
import useMonitorRelayReceiver from "./useMonitorRelayReceiver";

const noopHeardRef = { current: new Set() };

/**
 * Live PTT receive via Storage relay chunks.
 * When Agora is enabled on Talk, live audio comes from usePttBroadcast instead.
 */
export default function usePttReceiver({
  channelId,
  channelIds,
  userId,
  enabled = true,
  onRemoteTalkStart,
}) {
  const relay = useRelayReceiver({
    channelId: enabled ? channelId : null,
    userId,
  });
  const monitorRelay = useMonitorRelayReceiver({
    userId,
    channelIds: enabled ? (channelIds || []) : [],
  });

  if (!enabled) {
    return {
      isReceiving: false,
      heardBroadcastsRef: noopHeardRef,
      transport: isAgoraEnabled() ? "agora" : "storage",
    };
  }

  if (channelIds?.length) {
    return {
      isReceiving: monitorRelay.isReceiving,
      heardBroadcastsRef: monitorRelay.heardBroadcastsRef,
      transport: isAgoraEnabled() ? "agora+relay" : "storage",
    };
  }

  return {
    isReceiving: relay.isReceiving,
    heardBroadcastsRef: relay.heardBroadcastsRef,
    transport: isAgoraEnabled() ? "agora+relay" : "storage",
  };
}
