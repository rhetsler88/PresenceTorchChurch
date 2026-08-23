import { isAgoraEnabled } from "@/lib/agora";
import useRelayReceiver from "./useRelayReceiver";
import useMonitorRelayReceiver from "./useMonitorRelayReceiver";

const noopHeardRef = { current: new Set() };

/**
 * Live PTT receive via Storage relay chunks.
 * When Agora is configured, live audio uses WebRTC only — relay is for recording/upload.
 */
export default function usePttReceiver({
  channelId,
  channelIds,
  userId,
  enabled = true,
  onRemoteTalkStart,
}) {
  const agoraEnabled = isAgoraEnabled();
  const relayEnabled = enabled && !agoraEnabled;

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
