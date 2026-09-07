import { isAgoraEnabled } from "@/lib/agora";
import useRelayReceiver from "./useRelayReceiver";
import useMonitorRelayReceiver from "./useMonitorRelayReceiver";

const noopHeardRef = { current: new Set() };

/**
 * Live PTT receive via Storage relay chunks (fallback when Agora is off or unavailable).
 * Relay stays enabled alongside Agora so mixed web/native clients still hear each other.
 */
export default function usePttReceiver({
  channelId,
  channelIds,
  userId,
  enabled = true,
  onRemoteTalkStart,
}) {
  const agoraEnabled = isAgoraEnabled();
  const relayEnabled = enabled;

  const relay = useRelayReceiver({
    channelId: relayEnabled ? channelId : null,
    userId,
  });
  const monitorRelay = useMonitorRelayReceiver({
    userId,
    channelIds: relayEnabled ? (channelIds || []) : [],
  });

  if (!enabled) {
    return {
      isReceiving: false,
      heardBroadcastsRef: noopHeardRef,
      transport: agoraEnabled ? "agora" : "storage",
    };
  }

  if (channelIds?.length) {
    return {
      isReceiving: monitorRelay.isReceiving,
      heardBroadcastsRef: monitorRelay.heardBroadcastsRef,
      transport: agoraEnabled ? "agora" : "storage",
    };
  }

  return {
    isReceiving: relay.isReceiving,
    heardBroadcastsRef: relay.heardBroadcastsRef,
    transport: agoraEnabled ? "agora" : "storage",
  };
}
