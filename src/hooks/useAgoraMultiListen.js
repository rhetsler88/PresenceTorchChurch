import { useState, useEffect, useRef } from "react";
import {
  fetchAgoraCredentials,
  isSameAgoraUid,
  subscribeExistingRemoteUsers,
  subscribeRemoteAudio,
} from "@/lib/agoraRemote";
import { acquireAgoraClient, releaseAgoraClient, sessionKey } from "@/lib/agoraSession";
import { configureAgoraSdk } from "@/lib/agoraInit";
import { playClearTone } from "@/lib/pttTones";

configureAgoraSdk();

function isExpectedJoinCancel(err) {
  const code = String(err?.code || "");
  const message = String(err?.message || err || "");
  return (
    code.includes("WS_ABORT")
    || code.includes("LEAVE")
    || code.includes("OPERATION_ABORTED")
    || message.includes("WS_ABORT")
    || message.includes("LEAVE")
  );
}

function detachRemoteHandlers(client) {
  client.removeAllListeners("user-published");
  client.removeAllListeners("user-unpublished");
}

/**
 * Subscribe to live Agora audio on multiple Firebase channels (Monitor page).
 * Keeps existing channel clients when the set changes — only joins/leaves the delta.
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

  const channelKey = channelIds.filter(Boolean).sort().join("|");

  useEffect(() => {
    if (!userId || channelIds.length === 0) return undefined;

    let cancelled = false;
    let effectGen = 0;
    /** @type {Map<string, { client: import('agora-rtc-sdk-ng').IAgoraRTCClient, key: string }>} */
    const activeClients = new Map();
    /** @type {Map<string, { promise: Promise<import('agora-rtc-sdk-ng').IAgoraRTCClient>, key: string | null }>} */
    const pendingJoins = new Map();

    const syncRemoteReceiving = () => {
      if (remoteCountRef.current > 0) setIsReceiving(true);
      else setIsReceiving(false);
    };

    const attachRemoteHandlers = (client, channelId, uid) => {
      client.on("user-published", async (remoteUser, mediaType) => {
        if (cancelled || !activeClients.has(channelId)) return;
        if (mediaType !== "audio") return;
        if (isSameAgoraUid(remoteUser.uid, uid)) return;
        try {
          const subscribed = await subscribeRemoteAudio(client, remoteUser, uid, mediaType);
          if (subscribed && !cancelled && activeClients.has(channelId)) {
            remoteCountRef.current += 1;
            setIsReceiving(true);
            playClearTone();
            paramsRef.current.onRemoteTalkStart?.(channelId, remoteUser.uid);
          }
        } catch (err) {
          console.error(`Agora subscribe failed for channel ${channelId}:`, err);
        }
      });

      client.on("user-unpublished", (_remoteUser, mediaType) => {
        if (mediaType !== "audio") return;
        remoteCountRef.current = Math.max(0, remoteCountRef.current - 1);
        syncRemoteReceiving();
      });
    };

    const joinChannel = async (channelId, gen) => {
      let key = null;
      let client = null;
      try {
        const { appId, token, channelName, uid } = await fetchAgoraCredentials(channelId, userId);
        if (!appId || !token || cancelled || gen !== effectGen) return;

        key = sessionKey(channelName, uid);
        const joinPromise = acquireAgoraClient(key, async (pendingClient) => {
          await pendingClient.join(appId, channelName, token, uid);
        });
        pendingJoins.set(channelId, { promise: joinPromise, key });

        client = await joinPromise;
        pendingJoins.delete(channelId);

        if (cancelled || gen !== effectGen) {
          await releaseAgoraClient(key);
          return;
        }

        attachRemoteHandlers(client, channelId, uid);
        activeClients.set(channelId, { client, key });
        clientsRef.current = new Map([...activeClients].map(([id, entry]) => [id, entry.client]));

        await subscribeExistingRemoteUsers(client, uid, () => {
          if (cancelled || !activeClients.has(channelId)) return;
          remoteCountRef.current += 1;
          setIsReceiving(true);
          playClearTone();
          paramsRef.current.onRemoteTalkStart?.(channelId, null);
        });

        if (cancelled || gen !== effectGen) {
          detachRemoteHandlers(client);
          activeClients.delete(channelId);
          await releaseAgoraClient(key);
          return;
        }
      } catch (err) {
        const pending = pendingJoins.get(channelId);
        pendingJoins.delete(channelId);
        if (client && key) {
          detachRemoteHandlers(client);
          await releaseAgoraClient(key).catch(() => {});
        } else if (pending?.key) {
          try {
            await pending.promise;
          } catch {
            // join failed
          }
          await releaseAgoraClient(pending.key).catch(() => {});
        } else if (key) {
          await releaseAgoraClient(key).catch(() => {});
        }
        if (!cancelled && gen === effectGen && !isExpectedJoinCancel(err)) {
          console.error(`Agora listen failed for channel ${channelId}:`, err);
        }
      }
    };

    const removeChannel = async (channelId) => {
      const pending = pendingJoins.get(channelId);
      if (pending) {
        pendingJoins.delete(channelId);
        try {
          await pending.promise;
        } catch {
          // join failed or aborted
        }
        if (pending.key) {
          await releaseAgoraClient(pending.key);
        }
      }
      const active = activeClients.get(channelId);
      if (active) {
        activeClients.delete(channelId);
        detachRemoteHandlers(active.client);
        await releaseAgoraClient(active.key);
      }
    };

    const syncChannels = async () => {
      effectGen += 1;
      const gen = effectGen;
      const wanted = new Set(channelIds.filter(Boolean));

      const toRemove = [...activeClients.keys(), ...pendingJoins.keys()]
        .filter((id) => !wanted.has(id));
      await Promise.all(toRemove.map((id) => removeChannel(id)));

      if (cancelled || gen !== effectGen) return;

      const toAdd = [...wanted].filter((id) => !activeClients.has(id) && !pendingJoins.has(id));
      for (const channelId of toAdd) {
        if (cancelled || gen !== effectGen) break;
        await joinChannel(channelId, gen);
      }

      if (!cancelled && gen === effectGen) {
        clientsRef.current = new Map([...activeClients].map(([id, entry]) => [id, entry.client]));
      }
    };

    void syncChannels();

    return () => {
      cancelled = true;
      effectGen += 1;
      remoteCountRef.current = 0;
      setIsReceiving(false);

      void (async () => {
        for (const pending of pendingJoins.values()) {
          try {
            await pending.promise;
          } catch {
            // join failed or aborted
          }
          if (pending.key) {
            await releaseAgoraClient(pending.key).catch(() => {});
          }
        }
        pendingJoins.clear();

        const leaveTasks = [];
        for (const { client, key } of activeClients.values()) {
          detachRemoteHandlers(client);
          leaveTasks.push(releaseAgoraClient(key));
        }
        activeClients.clear();
        await Promise.all(leaveTasks);
        clientsRef.current = new Map();
      })();
    };
  }, [userId, channelKey]);

  return { isReceiving, heardBroadcastsRef };
}
