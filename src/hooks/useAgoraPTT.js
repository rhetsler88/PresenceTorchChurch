import { useState, useCallback, useRef, useEffect } from "react";
import AgoraRTC from "agora-rtc-sdk-ng";
import { uploadPrivateAudio } from "@/api/storage";
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

const RETRY_DELAYS_MS = [1000, 3000, 8000];
const IDLE_LEAVE_MS = 30000;

function getSupportedMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

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
  playClearTone();
}

function attachRemoteHandlers(client, joinGen, joinGenRef, uid, remoteSpeakerCountRef, setIsReceiving, onRemoteActivity) {
  client.on("user-published", async (remoteUser, mediaType) => {
    if (joinGen !== joinGenRef.current) return;
    if (mediaType !== "audio") return;
    if (isSameAgoraUid(remoteUser.uid, uid)) return;
    try {
      const subscribed = await subscribeRemoteAudio(client, remoteUser, uid, mediaType);
      if (subscribed && joinGen === joinGenRef.current) {
        markRemoteSpeaker(remoteSpeakerCountRef, setIsReceiving);
        onRemoteActivity?.();
      }
    } catch (err) {
      console.error("Agora subscribe failed:", err);
    }
  });

  client.on("user-unpublished", (_remoteUser, mediaType) => {
    if (mediaType !== "audio") return;
    remoteSpeakerCountRef.current = Math.max(0, remoteSpeakerCountRef.current - 1);
    if (remoteSpeakerCountRef.current === 0) setIsReceiving(false);
  });
}

function detachRemoteHandlers(client) {
  client.removeAllListeners("user-published");
  client.removeAllListeners("user-unpublished");
}

/**
 * Real-time PTT over Agora WebRTC.
 * Lazy-joins the channel only while listening (remote PTT) or transmitting.
 * Storage relay handles idle passive listening to avoid Agora billing.
 */
export default function useAgoraPTT({
  channelId,
  userId,
  listenActive = false,
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [isChannelReady, setIsChannelReady] = useState(false);

  const clientRef = useRef(null);
  const sessionKeyRef = useRef(null);
  const localAudioTrackRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const fullChunksRef = useRef([]);
  const mimeRef = useRef("audio/webm");
  const broadcastIdRef = useRef(null);
  const startTimeRef = useRef(0);
  const activeRef = useRef(false);
  const remoteSpeakerCountRef = useRef(0);
  const heardBroadcastsRef = useRef(new Set());
  const joinGenRef = useRef(0);
  const joinPromiseRef = useRef(null);
  const idleLeaveTimerRef = useRef(null);
  const listenActiveRef = useRef(listenActive);
  const releaseConnectionRef = useRef(null);

  listenActiveRef.current = listenActive;

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
    if (activeRef.current || listenActiveRef.current) return;
    idleLeaveTimerRef.current = setTimeout(() => {
      if (activeRef.current || listenActiveRef.current || remoteSpeakerCountRef.current > 0) return;
      releaseConnectionRef.current?.();
    }, IDLE_LEAVE_MS);
  }, [clearIdleLeaveTimer]);

  const bumpRemoteActivity = useCallback(() => {
    clearIdleLeaveTimer();
    scheduleIdleLeave();
  }, [clearIdleLeaveTimer, scheduleIdleLeave]);

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
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    const client = clientRef.current;
    const key = sessionKeyRef.current;
    if (client) detachRemoteHandlers(client);
    clientRef.current = null;
    sessionKeyRef.current = null;

    if (key) {
      await releaseAgoraClient(key).catch(() => {});
    }
  }, [clearIdleLeaveTimer]);

  releaseConnectionRef.current = releaseConnection;

  const ensureJoined = useCallback(async (retryIndex = 0) => {
    const { channelId: cid, userId: uid } = paramsRef.current;
    if (!cid || !uid) return null;
    if (clientRef.current) return clientRef.current;

    const joinGen = ++joinGenRef.current;
    clearIdleLeaveTimer();

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
          detachRemoteHandlers(client);
          await releaseAgoraClient(key);
          sessionKeyRef.current = null;
          return null;
        }

        attachRemoteHandlers(
          client,
          joinGen,
          joinGenRef,
          agoraUid,
          remoteSpeakerCountRef,
          setIsReceiving,
          bumpRemoteActivity
        );
        clientRef.current = client;

        await subscribeExistingRemoteUsers(client, agoraUid, () => {
          markRemoteSpeaker(remoteSpeakerCountRef, setIsReceiving);
          bumpRemoteActivity();
        });

        if (joinGen !== joinGenRef.current) {
          detachRemoteHandlers(client);
          clientRef.current = null;
          await releaseAgoraClient(key);
          sessionKeyRef.current = null;
          return null;
        }

        setIsChannelReady(true);
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
          return null;
        }

        const nextRetry = retry + 1;
        if (nextRetry <= RETRY_DELAYS_MS.length) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[retry] ?? 8000));
          if (joinGen !== joinGenRef.current) return null;
          return attemptJoin(nextRetry);
        }

        console.error("Agora join failed:", err);
        if (joinGen === joinGenRef.current) setIsChannelReady(false);
        return null;
      }
    };

    const joinTask = attemptJoin(retryIndex);
    joinPromiseRef.current = joinTask;
    return joinTask;
  }, [bumpRemoteActivity, clearIdleLeaveTimer, scheduleIdleLeave]);

  // Tear down when channel/user changes — do not auto-join the new channel.
  useEffect(() => {
    if (!channelId || !userId) {
      setIsChannelReady(false);
      return undefined;
    }

    return () => {
      void releaseConnection();
    };
  }, [channelId, userId, releaseConnection]);

  // Join for live listen only while listenActive (remote PTT signal / local press).
  useEffect(() => {
    if (!channelId || !userId) return undefined;

    if (listenActive) {
      clearIdleLeaveTimer();
      const joinTask = ensureJoined();
      void joinTask;
      return undefined;
    }

    scheduleIdleLeave();
    return undefined;
  }, [listenActive, channelId, userId, ensureJoined, clearIdleLeaveTimer, scheduleIdleLeave]);

  useEffect(() => () => {
    clearIdleLeaveTimer();
  }, [clearIdleLeaveTimer]);

  const startRecording = useCallback(async () => {
    const { channelId: cid, userId: uid } = paramsRef.current;
    if (!cid || !uid || activeRef.current) return Boolean(activeRef.current);

    clearIdleLeaveTimer();
    let client = clientRef.current;
    if (!client) {
      client = await ensureJoined();
    }
    if (!client && joinPromiseRef.current) {
      client = await joinPromiseRef.current;
    }
    if (!client) {
      console.error("Agora client not ready — join failed or still connecting");
      return false;
    }

    try {
      broadcastIdRef.current = crypto.randomUUID();
      heardBroadcastsRef.current.add(broadcastIdRef.current);
      fullChunksRef.current = [];
      startTimeRef.current = Date.now();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const localTrack = await AgoraRTC.createCustomAudioTrack({
        mediaStreamTrack: stream.getAudioTracks()[0],
        encoderConfig: "speech_standard",
      });
      localAudioTrackRef.current = localTrack;
      await client.publish([localTrack]);

      const mimeType = getSupportedMime();
      mimeRef.current = mimeType || "audio/webm";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) fullChunksRef.current.push(event.data);
      };
      recorderRef.current = recorder;
      recorder.start(250);

      activeRef.current = true;
      setIsRecording(true);
      return true;
    } catch (err) {
      console.error("Agora publish failed:", err);
      if (localAudioTrackRef.current) {
        await client.unpublish([localAudioTrackRef.current]).catch(() => {});
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      scheduleIdleLeave();
      return false;
    }
  }, [ensureJoined, clearIdleLeaveTimer, scheduleIdleLeave]);

  const stopRecording = useCallback(async () => {
    if (!activeRef.current && !localAudioTrackRef.current) return null;

    activeRef.current = false;
    setIsRecording(false);

    const client = clientRef.current;
    const localTrack = localAudioTrackRef.current;

    if (recorderRef.current?.state === "recording") {
      await new Promise((resolve) => {
        recorderRef.current.addEventListener("stop", resolve, { once: true });
        recorderRef.current.stop();
      });
    }
    recorderRef.current = null;

    if (localTrack && client) {
      await client.unpublish([localTrack]).catch(() => {});
      localTrack.stop();
      localTrack.close();
      localAudioTrackRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    scheduleIdleLeave();

    const duration = (Date.now() - startTimeRef.current) / 1000;
    const broadcastId = broadcastIdRef.current;
    const fullBlob = fullChunksRef.current.length
      ? new Blob(fullChunksRef.current, { type: mimeRef.current })
      : null;
    fullChunksRef.current = [];

    if (!fullBlob || fullBlob.size === 0) {
      console.error("Agora recording produced no audio data");
      return null;
    }

    try {
      const file = new File([fullBlob], "message.webm", { type: mimeRef.current });
      const { file_uri } = await uploadPrivateAudio(
        file,
        `${paramsRef.current.channelId}/messages/${broadcastId}.webm`
      );
      return { file_url: file_uri, duration, broadcast_id: broadcastId };
    } catch (err) {
      console.error("Private audio upload failed:", err);
      return null;
    }
  }, [scheduleIdleLeave]);

  return {
    isRecording,
    isReceiving,
    isChannelReady,
    startRecording,
    stopRecording,
    heardBroadcastsRef,
  };
}
