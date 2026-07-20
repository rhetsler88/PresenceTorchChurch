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

function attachRemoteHandlers(client, joinGen, joinGenRef, uid, remoteSpeakerCountRef, setIsReceiving) {
  client.on("user-published", async (remoteUser, mediaType) => {
    if (joinGen !== joinGenRef.current) return;
    if (mediaType !== "audio") return;
    if (isSameAgoraUid(remoteUser.uid, uid)) return;
    try {
      const subscribed = await subscribeRemoteAudio(client, remoteUser, uid, mediaType);
      if (subscribed && joinGen === joinGenRef.current) {
        markRemoteSpeaker(remoteSpeakerCountRef, setIsReceiving);
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
 * Joins the channel as a listener; publishes mic only while PTT is held.
 * MediaRecorder captures the session for voiceMessages history on release.
 */
export default function useAgoraPTT({
  channelId,
  userId,
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

  const paramsRef = useRef({ channelId, userId });
  paramsRef.current = { channelId, userId };

  useEffect(() => {
    if (!channelId || !userId) {
      setIsChannelReady(false);
      return undefined;
    }

    const joinGen = ++joinGenRef.current;
    let cancelled = false;
    let joinedClient = null;

    const attemptJoin = async (retry = false) => {
      try {
        const { appId, token, channelName, uid } = await fetchAgoraCredentials(channelId, userId);
        if (cancelled || joinGen !== joinGenRef.current) return null;
        if (!appId || !token) throw new Error("Missing Agora credentials");

        const key = sessionKey(channelName, uid);
        sessionKeyRef.current = key;

        const client = await acquireAgoraClient(key, async (pendingClient) => {
          await pendingClient.join(appId, channelName, token, uid);
        });

        if (cancelled || joinGen !== joinGenRef.current) {
          await releaseAgoraClient(key);
          sessionKeyRef.current = null;
          return null;
        }

        attachRemoteHandlers(client, joinGen, joinGenRef, uid, remoteSpeakerCountRef, setIsReceiving);
        joinedClient = client;
        clientRef.current = client;

        await subscribeExistingRemoteUsers(
          client,
          uid,
          () => markRemoteSpeaker(remoteSpeakerCountRef, setIsReceiving)
        );

        if (cancelled || joinGen !== joinGenRef.current) {
          detachRemoteHandlers(client);
          clientRef.current = null;
          await releaseAgoraClient(key);
          sessionKeyRef.current = null;
          return null;
        }

        setIsChannelReady(true);
        return client;
      } catch (err) {
        if (sessionKeyRef.current) {
          if (joinedClient) detachRemoteHandlers(joinedClient);
          await releaseAgoraClient(sessionKeyRef.current).catch(() => {});
          sessionKeyRef.current = null;
          clientRef.current = null;
        }
        if (cancelled || joinGen !== joinGenRef.current || isExpectedJoinCancel(err)) {
          return null;
        }
        if (!retry) {
          await new Promise((r) => setTimeout(r, 800));
          if (cancelled || joinGen !== joinGenRef.current) return null;
          return attemptJoin(true);
        }
        console.error("Agora join failed:", err);
        if (joinGen === joinGenRef.current) setIsChannelReady(false);
        return null;
      }
    };

    const joinTask = attemptJoin(false);
    joinPromiseRef.current = joinTask;
    void joinTask;

    return () => {
      cancelled = true;
      joinGenRef.current += 1;
      const key = sessionKeyRef.current;
      const client = joinedClient || clientRef.current;

      void (async () => {
        const pendingJoin = joinPromiseRef.current;
        joinPromiseRef.current = null;
        if (pendingJoin) {
          await pendingJoin.catch(() => {});
        }

        if (activeRef.current) {
          // Unpublish happens in stopRecording — don't leave mid-transmit
          return;
        }

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

        if (client) detachRemoteHandlers(client);
        clientRef.current = null;
        sessionKeyRef.current = null;

        if (key) {
          await releaseAgoraClient(key);
        }
      })();
    };
  }, [channelId, userId]);

  const startRecording = useCallback(async () => {
    const { channelId: cid, userId: uid } = paramsRef.current;
    if (!cid || !uid || activeRef.current) return Boolean(activeRef.current);

    let client = clientRef.current;
    if (!client && joinPromiseRef.current) {
      client = await joinPromiseRef.current;
    }
    if (!client) {
      await new Promise((r) => setTimeout(r, 500));
      client = clientRef.current;
      if (!client && joinPromiseRef.current) {
        client = await joinPromiseRef.current;
      }
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
      return false;
    }
  }, []);

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
  }, []);

  return {
    isRecording,
    isReceiving,
    isChannelReady,
    startRecording,
    stopRecording,
    heardBroadcastsRef,
  };
}
