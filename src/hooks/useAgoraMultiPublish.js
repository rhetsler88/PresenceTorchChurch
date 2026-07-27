import { useState, useCallback, useRef } from "react";
import AgoraRTC from "agora-rtc-sdk-ng";
import { fetchAgoraCredentials } from "@/lib/agoraRemote";
import { acquireAgoraClient, releaseAgoraClient, sessionKey } from "@/lib/agoraSession";
import { configureAgoraSdk } from "@/lib/agoraInit";

configureAgoraSdk();

/**
 * Publish live mic audio to multiple Agora channels at once (Monitor broadcast-all).
 * Each channel gets its own client and audio track (Agora requires one track per client).
 */
export default function useAgoraMultiPublish({ userId }) {
  const [isRecording, setIsRecording] = useState(false);

  const streamRef = useRef(null);
  const broadcastIdRef = useRef(null);
  const heardBroadcastsRef = useRef(new Set());
  const activeRef = useRef(false);
  /** @type {React.MutableRefObject<Map<string, { key: string, client: import('agora-rtc-sdk-ng').IAgoraRTCClient, track: import('agora-rtc-sdk-ng').ILocalAudioTrack, publishStream: MediaStream | null }>>} */
  const sessionsRef = useRef(new Map());
  const paramsRef = useRef({ userId });
  paramsRef.current = { userId };

  const teardownSessions = useCallback(async ({ stopStream = true } = {}) => {
    const sessions = [...sessionsRef.current.entries()];
    sessionsRef.current.clear();

    for (const [, session] of sessions) {
      const { client, key, track, publishStream } = session;
      if (track && client) {
        await client.unpublish([track]).catch(() => {});
        track.stop();
        track.close();
      }
      if (publishStream) {
        publishStream.getTracks().forEach((t) => t.stop());
      }
      await releaseAgoraClient(key).catch(() => {});
    }

    if (stopStream && streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const publishToChannel = useCallback(async (channelId, stream, cloneStream) => {
    const uid = paramsRef.current.userId;
    const { appId, token, channelName, uid: agoraUid } = await fetchAgoraCredentials(channelId, uid);
    if (!appId || !token) throw new Error("Missing Agora credentials");

    const key = sessionKey(channelName, agoraUid);
    const client = await acquireAgoraClient(key, async (pendingClient) => {
      await pendingClient.join(appId, channelName, token, agoraUid);
    });

    let publishStream = stream;
    if (cloneStream) {
      try {
        publishStream = stream.clone();
      } catch {
        publishStream = stream;
      }
    }

    const localTrack = await AgoraRTC.createCustomAudioTrack({
      mediaStreamTrack: publishStream.getAudioTracks()[0],
      encoderConfig: "speech_standard",
    });

    await client.publish([localTrack]);
    sessionsRef.current.set(channelId, {
      key,
      client,
      track: localTrack,
      publishStream: publishStream !== stream ? publishStream : null,
    });
  }, []);

  const startRecording = useCallback(async ({ broadcastId, channelIds = [], onStreamReady } = {}) => {
    const uid = paramsRef.current.userId;
    const ids = [...new Set(channelIds.filter(Boolean))];
    if (!uid || ids.length === 0 || activeRef.current) return Boolean(activeRef.current);

    try {
      broadcastIdRef.current = broadcastId || crypto.randomUUID();
      heardBroadcastsRef.current.add(broadcastIdRef.current);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      activeRef.current = true;
      setIsRecording(true);
      onStreamReady?.(stream);

      void Promise.all(
        ids.map((channelId, index) => publishToChannel(channelId, stream, index > 0))
      ).catch(async (err) => {
        console.error("Agora multi-publish failed:", err);
        activeRef.current = false;
        setIsRecording(false);
        await teardownSessions({ stopStream: true });
      });

      return true;
    } catch (err) {
      console.error("Agora multi-publish failed:", err);
      activeRef.current = false;
      setIsRecording(false);
      await teardownSessions({ stopStream: true });
      return false;
    }
  }, [publishToChannel, teardownSessions]);

  const stopRecording = useCallback(async ({ stopStream = true } = {}) => {
    if (!activeRef.current && sessionsRef.current.size === 0) return;

    activeRef.current = false;
    setIsRecording(false);
    await teardownSessions({ stopStream });
  }, [teardownSessions]);

  const getMediaStream = useCallback(() => streamRef.current, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
    getMediaStream,
    heardBroadcastsRef,
  };
}
