import { useState, useCallback, useRef, useEffect } from "react";
import AgoraRTC from "agora-rtc-sdk-ng";
import {
  fetchAgoraCredentials,
  isSameAgoraUid,
  subscribeExistingRemoteUsers,
  subscribeRemoteAudio,
} from "@/lib/agoraRemote";
import { acquireAgoraClient, releaseAgoraClient, sessionKey } from "@/lib/agoraSession";
import { configureAgoraSdk } from "@/lib/agoraInit";
import { AGORA_SPEECH_ENCODER } from "@/lib/agoraAudio";
import { destroyMicDenoise, openMicSession } from "@/lib/micDenoise";
import { prepareNativeAgoraAudio, releaseNativeAgoraAudio } from "@/lib/nativeVoiceProcessing";
import { pttDebugLog } from "@/lib/pttDebugLog";

configureAgoraSdk();

const RETRY_DELAYS_MS = [1000, 3000, 8000];
/** Keep Agora joined briefly after PTT — avoids rejoin latency without long idle billing. */
const IDLE_LEAVE_MS = 3 * 60 * 1000;
/** Debounce live-listen joins so rapid PTT on/off does not open/close Agora WS mid-handshake. */
const JOIN_DEBOUNCE_MS = 200;

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

function markRemoteSpeaker(remoteSpeakerCountRef, setIsReceiving) {
  remoteSpeakerCountRef.current += 1;
  setIsReceiving(true);
}

function attachRemoteHandlers(
  client,
  channelId,
  localUserId,
  joinGen,
  joinGenRef,
  uid,
  remoteSpeakerCountRef,
  setIsReceiving,
  onRemoteActivity,
  onRemoteAudioStart,
) {
  const onPublished = async (remoteUser, mediaType) => {
    if (joinGen !== joinGenRef.current) return;
    if (mediaType !== "audio") return;
    if (isSameAgoraUid(remoteUser.uid, uid)) return;
    try {
      const subscribed = await subscribeRemoteAudio(
        client,
        remoteUser,
        uid,
        mediaType,
        { channelId, firebaseUserId: localUserId },
      );
      if (subscribed && joinGen === joinGenRef.current) {
        markRemoteSpeaker(remoteSpeakerCountRef, setIsReceiving);
        onRemoteActivity?.();
        onRemoteAudioStart?.();
      }
    } catch (err) {
      console.error("Agora subscribe failed:", err);
    }
  };

  const onUnpublished = (_remoteUser, mediaType) => {
    if (mediaType !== "audio") return;
    remoteSpeakerCountRef.current = Math.max(0, remoteSpeakerCountRef.current - 1);
    if (remoteSpeakerCountRef.current === 0) setIsReceiving(false);
  };

  client.on("user-published", onPublished);
  client.on("user-unpublished", onUnpublished);
  return { onPublished, onUnpublished };
}

function detachRemoteHandlers(client, handlers) {
  if (!client || !handlers) return;
  client.off("user-published", handlers.onPublished);
  client.off("user-unpublished", handlers.onUnpublished);
}

/**
 * Real-time PTT over Agora WebRTC.
 * Joins the channel while listening (channel open) or while transmitting.
 * Chat history is archived by useRelayBroadcast on the same mic stream.
 */
export default function useAgoraPTT({
  channelId,
  userId,
  listenActive = false,
  /** Join channel on mount (no mic) so PTT only publishes — cuts cold-start latency. */
  warmJoin = false,
  /** When false, only publish — remote audio is handled elsewhere (e.g. useAgoraMultiListen). */
  receiveEnabled = listenActive,
  /** Called when remote live audio starts (used to mark broadcast heard for auto-play skip). */
  onRemoteLiveAudio,
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [isChannelReady, setIsChannelReady] = useState(false);

  const clientRef = useRef(null);
  const sessionKeyRef = useRef(null);
  const localAudioTrackRef = useRef(null);
  const rawStreamRef = useRef(null);
  const denoiseHandleRef = useRef(null);
  const streamRef = useRef(null);
  const broadcastIdRef = useRef(null);
  const startTimeRef = useRef(0);
  const activeRef = useRef(false);
  const remoteSpeakerCountRef = useRef(0);
  const heardBroadcastsRef = useRef(new Set());
  const joinGenRef = useRef(0);
  const joinPromiseRef = useRef(null);
  const idleLeaveTimerRef = useRef(null);
  const listenActiveRef = useRef(listenActive);
  const warmJoinRef = useRef(warmJoin);
  const receiveEnabledRef = useRef(receiveEnabled);
  const ownsStreamRef = useRef(true);
  const onRemoteLiveAudioRef = useRef(onRemoteLiveAudio);
  const releaseConnectionRef = useRef(null);
  const remoteHandlersRef = useRef(null);
  const agoraPreparedRef = useRef(false);

  listenActiveRef.current = listenActive;
  warmJoinRef.current = warmJoin;
  receiveEnabledRef.current = receiveEnabled;
  onRemoteLiveAudioRef.current = onRemoteLiveAudio;

  const paramsRef = useRef({ channelId, userId });
  paramsRef.current = { channelId, userId };

  const clearIdleLeaveTimer = useCallback(() => {
    if (idleLeaveTimerRef.current) {
      clearTimeout(idleLeaveTimerRef.current);
      idleLeaveTimerRef.current = null;
    }
  }, []);

  const scheduleIdleLeave = useCallback(() => {
    clearIdleLeaveTimer();
    if (activeRef.current || listenActiveRef.current || warmJoinRef.current) return;
    idleLeaveTimerRef.current = setTimeout(() => {
      if (
        activeRef.current
        || listenActiveRef.current
        || warmJoinRef.current
        || remoteSpeakerCountRef.current > 0
      ) {
        return;
      }
      releaseConnectionRef.current?.();
    }, IDLE_LEAVE_MS);
  }, [clearIdleLeaveTimer]);

  const bumpRemoteActivity = useCallback(() => {
    clearIdleLeaveTimer();
    scheduleIdleLeave();
  }, [clearIdleLeaveTimer, scheduleIdleLeave]);

  const holdNativeAgoraAudio = useCallback(async () => {
    if (agoraPreparedRef.current) return;
    await prepareNativeAgoraAudio();
    agoraPreparedRef.current = true;
  }, []);

  const dropNativeAgoraAudio = useCallback(async () => {
    if (!agoraPreparedRef.current) return;
    agoraPreparedRef.current = false;
    await releaseNativeAgoraAudio();
  }, []);

  const notifyRemoteLiveAudio = useCallback(() => {
    pttDebugLog("agora.remote-audio.start", {
      channelId: paramsRef.current.channelId,
      source: "single-channel",
    });
    onRemoteLiveAudioRef.current?.();
  }, []);

  const releaseOwnedStream = useCallback(async () => {
    if (!streamRef.current || !ownsStreamRef.current) return;
    await destroyMicDenoise({
      handle: denoiseHandleRef.current,
      rawStream: rawStreamRef.current,
      stream: streamRef.current,
    });
    streamRef.current = null;
    rawStreamRef.current = null;
    denoiseHandleRef.current = null;
  }, []);

  const releaseConnection = useCallback(async () => {
    clearIdleLeaveTimer();
    joinGenRef.current += 1;

    const pendingJoin = joinPromiseRef.current;
    joinPromiseRef.current = null;
    if (pendingJoin) {
      await pendingJoin.catch(() => {});
    }

    if (activeRef.current) return;

    setIsChannelReady(false);
    setIsReceiving(false);
    remoteSpeakerCountRef.current = 0;

    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.stop();
      localAudioTrackRef.current.close();
      localAudioTrackRef.current = null;
    }
    await releaseOwnedStream();

    const client = clientRef.current;
    const key = sessionKeyRef.current;
    if (client) {
      detachRemoteHandlers(client, remoteHandlersRef.current);
      remoteHandlersRef.current = null;
    }
    clientRef.current = null;
    sessionKeyRef.current = null;

    if (key) {
      await releaseAgoraClient(key).catch(() => {});
    }
    await dropNativeAgoraAudio();
  }, [clearIdleLeaveTimer, dropNativeAgoraAudio, releaseOwnedStream]);

  releaseConnectionRef.current = releaseConnection;

  const ensureJoined = useCallback(async (retryIndex = 0) => {
    const { channelId: cid, userId: uid } = paramsRef.current;
    if (!cid || !uid) return null;
    if (clientRef.current) {
      pttDebugLog("agora.ensureJoined.cached", { channelId: cid });
      return clientRef.current;
    }

    pttDebugLog("agora.ensureJoined.start", { channelId: cid, retryIndex });

    const joinGen = ++joinGenRef.current;
    clearIdleLeaveTimer();
    await holdNativeAgoraAudio();
    if (joinGen !== joinGenRef.current) {
      await dropNativeAgoraAudio();
      return null;
    }

    const attemptJoin = async (retry = retryIndex) => {
      try {
        const { appId, token, channelName, uid: agoraUid } = await fetchAgoraCredentials(cid, uid);
        if (joinGen !== joinGenRef.current) return null;
        if (!appId || !token) throw new Error("Missing Agora credentials");

        const key = sessionKey(channelName, agoraUid);
        sessionKeyRef.current = key;

        const joinPromise = acquireAgoraClient(key, async (pendingClient) => {
          await pendingClient.join(appId, channelName, token, agoraUid);
        });
        joinPromiseRef.current = joinPromise;

        const client = await joinPromise;
        joinPromiseRef.current = null;

        if (joinGen !== joinGenRef.current) {
          detachRemoteHandlers(client, remoteHandlersRef.current);
          remoteHandlersRef.current = null;
          await releaseAgoraClient(key);
          sessionKeyRef.current = null;
          return null;
        }

        if (receiveEnabledRef.current) {
          remoteHandlersRef.current = attachRemoteHandlers(
            client,
            cid,
            uid,
            joinGen,
            joinGenRef,
            agoraUid,
            remoteSpeakerCountRef,
            setIsReceiving,
            bumpRemoteActivity,
            notifyRemoteLiveAudio,
          );

          await subscribeExistingRemoteUsers(
            client,
            agoraUid,
            () => {
              markRemoteSpeaker(remoteSpeakerCountRef, setIsReceiving);
              bumpRemoteActivity();
              notifyRemoteLiveAudio();
            },
            { channelId: cid, firebaseUserId: uid },
          );

          if (joinGen !== joinGenRef.current) {
            detachRemoteHandlers(client, remoteHandlersRef.current);
            remoteHandlersRef.current = null;
            clientRef.current = null;
            await releaseAgoraClient(key);
            sessionKeyRef.current = null;
            return null;
          }
        }

        clientRef.current = client;

        setIsChannelReady(true);
        pttDebugLog("agora.ensureJoined.done", { channelId: cid, receiveEnabled: receiveEnabledRef.current });
        scheduleIdleLeave();
        return client;
      } catch (err) {
        joinPromiseRef.current = null;
        if (sessionKeyRef.current) {
          await releaseAgoraClient(sessionKeyRef.current).catch(() => {});
          sessionKeyRef.current = null;
        }
        clientRef.current = null;

        if (joinGen !== joinGenRef.current || isExpectedJoinCancel(err)) {
          await dropNativeAgoraAudio();
          return null;
        }

        const nextRetry = retry + 1;
        if (nextRetry <= RETRY_DELAYS_MS.length) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[retry] ?? 8000));
          if (joinGen !== joinGenRef.current) {
            await dropNativeAgoraAudio();
            return null;
          }
          return attemptJoin(nextRetry);
        }

        console.error("Agora join failed:", err);
        pttDebugLog("agora.ensureJoined.failed", { channelId: cid, message: String(err?.message || err) });
        if (joinGen === joinGenRef.current) setIsChannelReady(false);
        await dropNativeAgoraAudio();
        return null;
      }
    };

    const joinTask = attemptJoin(retryIndex);
    joinPromiseRef.current = joinTask;
    return joinTask;
  }, [bumpRemoteActivity, clearIdleLeaveTimer, dropNativeAgoraAudio, holdNativeAgoraAudio, notifyRemoteLiveAudio, scheduleIdleLeave]);

  useEffect(() => {
    if (!channelId || !userId) {
      setIsChannelReady(false);
      return undefined;
    }

    return () => {
      void releaseConnection();
    };
  }, [channelId, userId, releaseConnection]);

  useEffect(() => {
    if (!channelId || !userId) return undefined;

    if (listenActive || warmJoin) {
      clearIdleLeaveTimer();
      const timer = setTimeout(() => {
        if (!listenActiveRef.current && !warmJoinRef.current) return;
        pttDebugLog("agora.warmJoin.trigger", {
          channelId,
          listenActive: listenActiveRef.current,
          warmJoin: warmJoinRef.current,
        });
        void ensureJoined();
      }, JOIN_DEBOUNCE_MS);
      return () => clearTimeout(timer);
    }

    scheduleIdleLeave();
    return undefined;
  }, [listenActive, warmJoin, channelId, userId, ensureJoined, clearIdleLeaveTimer, scheduleIdleLeave]);

  useEffect(() => () => {
    clearIdleLeaveTimer();
  }, [clearIdleLeaveTimer]);

  const startRecording = useCallback(async ({ broadcastId, onStreamReady, sharedStream } = {}) => {
    const { channelId: cid, userId: uid } = paramsRef.current;
    if (!cid || !uid || activeRef.current) return Boolean(activeRef.current);

    pttDebugLog("agora.publish.start", {
      channelId: cid,
      broadcastId: broadcastId ?? null,
      hadWarmClient: Boolean(clientRef.current),
      sharedStream: Boolean(sharedStream),
    });
    clearIdleLeaveTimer();

    try {
      broadcastIdRef.current = broadcastId || crypto.randomUUID();
      heardBroadcastsRef.current.add(broadcastIdRef.current);
      startTimeRef.current = Date.now();

      ownsStreamRef.current = !sharedStream;
      let stream = sharedStream;
      let client = clientRef.current;
      const pendingJoin = client
        ? Promise.resolve(client)
        : (joinPromiseRef.current || ensureJoined());

      if (!sharedStream) {
        const [opened, joinedClient] = await Promise.all([
          openMicSession(),
          pendingJoin,
        ]);
        stream = opened.publishStream;
        streamRef.current = opened.publishStream;
        rawStreamRef.current = opened.rawStream;
        denoiseHandleRef.current = opened.handle;
        onStreamReady?.(opened.publishStream);
        client = clientRef.current || joinedClient;
      } else {
        streamRef.current = sharedStream;
        rawStreamRef.current = null;
        denoiseHandleRef.current = null;
        client = clientRef.current || await pendingJoin;
      }

      if (!client && joinPromiseRef.current) {
        client = await joinPromiseRef.current;
      }
      if (!client) {
        console.error("Agora client not ready — join failed or still connecting");
        pttDebugLog("agora.publish.failed", { channelId: cid, reason: "no-client" });
        if (ownsStreamRef.current) {
          await releaseOwnedStream();
        } else {
          streamRef.current = null;
        }
        return false;
      }

      const localTrack = await AgoraRTC.createCustomAudioTrack({
        mediaStreamTrack: stream.getAudioTracks()[0],
        encoderConfig: AGORA_SPEECH_ENCODER,
      });
      localAudioTrackRef.current = localTrack;
      await client.publish([localTrack]);

      activeRef.current = true;
      setIsRecording(true);
      pttDebugLog("agora.publish.done", { channelId: cid, broadcastId: broadcastIdRef.current });
      return true;
    } catch (err) {
      console.error("Agora publish failed:", err);
      pttDebugLog("agora.publish.failed", {
        channelId: cid,
        message: String(err?.message || err),
      });
      const client = clientRef.current;
      if (localAudioTrackRef.current) {
        await client?.unpublish([localAudioTrackRef.current]).catch(() => {});
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
      }
      if (ownsStreamRef.current) {
        await releaseOwnedStream();
      } else {
        streamRef.current = null;
      }
      scheduleIdleLeave();
      return false;
    }
  }, [ensureJoined, clearIdleLeaveTimer, scheduleIdleLeave, releaseOwnedStream]);

  const stopRecording = useCallback(async ({ stopStream = true } = {}) => {
    const hadLiveTrack = activeRef.current || localAudioTrackRef.current;

    if (hadLiveTrack) {
      activeRef.current = false;
      setIsRecording(false);

      const client = clientRef.current;
      const localTrack = localAudioTrackRef.current;

      if (localTrack && client) {
        await client.unpublish([localTrack]).catch(() => {});
        localTrack.stop();
        localTrack.close();
        localAudioTrackRef.current = null;
      }

      scheduleIdleLeave();
    }

    if (stopStream && ownsStreamRef.current) {
      await releaseOwnedStream();
    } else if (stopStream) {
      streamRef.current = null;
    }
  }, [scheduleIdleLeave, releaseOwnedStream]);

  const getMediaStream = useCallback(() => streamRef.current, []);

  return {
    isRecording,
    isReceiving,
    isChannelReady,
    ensureJoined,
    startRecording,
    stopRecording,
    getMediaStream,
    heardBroadcastsRef,
  };
}
