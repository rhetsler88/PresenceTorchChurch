import { useState, useEffect, useRef } from "react";
import AgoraRTC from "agora-rtc-sdk-ng";
import { api } from "@/api/client";
import { getAgoraAppId, toAgoraChannelName } from "@/lib/agora";

AgoraRTC.setLogLevel(3);

async function fetchAgoraCredentials(channelId) {
  const data = await api.functions.invoke("getAgoraToken", { channel_id: channelId });
  return {
    appId: data.app_id || getAgoraAppId(),
    token: data.token,
    channelName: data.channel_name || toAgoraChannelName(channelId),
    uid: data.uid,
  };
}

/**
 * Subscribe to live Agora audio on multiple Firebase channels (Monitor page).
 */
export default function useAgoraMultiListen({
  userId,
  channelIds = [],
  onRemoteTalkStart,
}) {
  const [isReceiving, setIsReceiving] = useState(false);
  const heardBroadcastsRef = useRef(new Set());
  const remoteCountRef = useRef(0);
  const clientsRef = useRef(new Map());
  const paramsRef = useRef({ userId, onRemoteTalkStart });
  paramsRef.current = { userId, onRemoteTalkStart };

  useEffect(() => {
    if (!userId || channelIds.length === 0) return undefined;

    let cancelled = false;
    const activeClients = new Map();

    (async () => {
      for (const channelId of channelIds) {
        if (cancelled) break;
        try {
          const { appId, token, channelName, uid } = await fetchAgoraCredentials(channelId);
          if (!appId || !token || cancelled) continue;

          const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

          client.on("user-published", async (remoteUser, mediaType) => {
            if (remoteUser.uid === uid || String(remoteUser.uid) === String(userId)) return;
            await client.subscribe(remoteUser, mediaType);
            if (mediaType === "audio") {
              remoteUser.audioTrack?.play();
              remoteCountRef.current += 1;
              setIsReceiving(true);
              paramsRef.current.onRemoteTalkStart?.(channelId, remoteUser.uid);
            }
          });

          client.on("user-unpublished", (_remoteUser, mediaType) => {
            if (mediaType !== "audio") return;
            remoteCountRef.current = Math.max(0, remoteCountRef.current - 1);
            if (remoteCountRef.current === 0) setIsReceiving(false);
          });

          await client.join(appId, channelName, token, uid);
          if (cancelled) {
            client.removeAllListeners();
            await client.leave().catch(() => {});
            continue;
          }
          activeClients.set(channelId, client);
        } catch (err) {
          console.error(`Agora listen failed for channel ${channelId}:`, err);
        }
      }
      if (!cancelled) clientsRef.current = activeClients;
    })();

    return () => {
      cancelled = true;
      remoteCountRef.current = 0;
      setIsReceiving(false);
      for (const client of activeClients.values()) {
        client.removeAllListeners();
        void client.leave().catch(() => {});
      }
      activeClients.clear();
      clientsRef.current = new Map();
    };
  }, [userId, channelIds.join("|")]);

  return { isReceiving, heardBroadcastsRef };
}
