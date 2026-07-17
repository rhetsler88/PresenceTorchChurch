import { useState, useCallback, useRef, useEffect } from "react";
import AgoraRTC from "agora-rtc-sdk-ng";
import { api } from "@/api/client";
import { uploadPrivateAudio } from "@/api/storage";
import { getAgoraAppId, toAgoraChannelName } from "@/lib/agora";
import { agoraUidFromFirebaseId } from "@/lib/agoraUid";
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

async function fetchAgoraCredentials(channelId, userId) {
  const data = await api.functions.invoke("getAgoraToken", { channel_id: channelId });
  const uid = typeof data.uid === "number" ? data.uid : agoraUidFromFirebaseId(userId);
  return {
    appId: data.app_id || getAgoraAppId(),
    token: data.token,
    channelName: data.channel_name || toAgoraChannelName(channelId),
    uid,
  };
}

/**
 * Real-time PTT over Agora WebRTC.
 * Joins the channel as a listener; publishes mic only while PTT is held.
 * MediaRecorder captures the session for voiceMessages history on release.
 */
export default function useAgoraPTT({
  channelId,
  userId,
  onRemoteTalkStart,
  onRemoteTalkStop,
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [isChannelReady, setIsChannelReady] = useState(false);

  const clientRef = useRef(null);
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

  const paramsRef = useRef({ channelId, userId, onRemoteTalkStart, onRemoteTalkStop });
  paramsRef.current = { channelId, userId, onRemoteTalkStart, onRemoteTalkStop };

  useEffect(() => {
    if (!channelId || !userId) return undefined;

    const joinGen = ++joinGenRef.current;
    let client = null;

    const joinTask = (async () => {
      try {
        const { appId, token, channelName, uid } = await fetchAgoraCredentials(channelId, userId);
        if (!appId || !token) throw new Error("Missing Agora credentials");
        if (joinGen !== joinGenRef.current) return null;

        client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        clientRef.current = client;

        client.on("user-published", async (remoteUser, mediaType) => {
          if (joinGen !== joinGenRef.current) return;
          if (remoteUser.uid === uid || String(remoteUser.uid) === String(uid)) return;
          await client.subscribe(remoteUser, mediaType);
          if (mediaType === "audio") {
            remoteUser.audioTrack?.play();
            remoteSpeakerCountRef.current += 1;
            setIsReceiving(true);
            playClearTone();
            paramsRef.current.onRemoteTalkStart?.(remoteUser.uid);
          }
        });

        client.on("user-unpublished", (remoteUser, mediaType) => {
          if (mediaType !== "audio") return;
          remoteSpeakerCountRef.current = Math.max(0, remoteSpeakerCountRef.current - 1);
          if (remoteSpeakerCountRef.current === 0) {
            setIsReceiving(false);
            paramsRef.current.onRemoteTalkStop?.(remoteUser.uid);
          }
        });

        await client.join(appId, channelName, token, uid);
        if (joinGen === joinGenRef.current) setIsChannelReady(true);
        return client;
      } catch (err) {
        console.error("Agora join failed:", err);
        if (client) {
          client.removeAllListeners();
          await client.leave().catch(() => {});
        }
        if (joinGen === joinGenRef.current) clientRef.current = null;
        if (joinGen === joinGenRef.current) setIsChannelReady(false);
        return null;
      }
    })();

    joinPromiseRef.current = joinTask;
    void joinTask;

    return () => {
      joinGenRef.current += 1;
      joinPromiseRef.current = null;
      setIsChannelReady(false);
      remoteSpeakerCountRef.current = 0;
      setIsReceiving(false);

      const cleanup = async () => {
        if (localAudioTrackRef.current) {
          localAudioTrackRef.current.stop();
          localAudioTrackRef.current.close();
          localAudioTrackRef.current = null;
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        if (client) {
          client.removeAllListeners();
          await client.leave().catch(() => {});
        }
        if (clientRef.current === client) clientRef.current = null;
      };
      void cleanup();
    };
  }, [channelId, userId]);

  const startRecording = useCallback(async () => {
    const { channelId: cid, userId: uid } = paramsRef.current;
    if (!cid || !uid || activeRef.current) return Boolean(activeRef.current);
    const client = clientRef.current || await joinPromiseRef.current;
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
      const { file_uri } = await uploadPrivateAudio(file, `messages/${broadcastId}.webm`);
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
