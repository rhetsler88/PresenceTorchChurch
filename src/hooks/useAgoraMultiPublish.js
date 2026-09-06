import { useState, useCallback, useRef, useEffect } from "react";
import AgoraRTC from "agora-rtc-sdk-ng";
import { fetchAgoraCredentials } from "@/lib/agoraRemote";
import { acquireAgoraClient, releaseAgoraClient, sessionKey } from "@/lib/agoraSession";
import { configureAgoraSdk } from "@/lib/agoraInit";
import { AGORA_SPEECH_ENCODER } from "@/lib/agoraAudio";
import { destroyMicDenoise, openMicSession } from "@/lib/micDenoise";
import { prepareNativeAgoraAudio } from "@/lib/nativeVoiceProcessing";
import { pttDebugLog } from "@/lib/pttDebugLog";

configureAgoraSdk();

/** Keep joined channels briefly after PTT — avoids rejoin on next broadcast. */
const IDLE_LEAVE_MS = 3 * 60 * 1000;

/**
 * Publish live mic audio to multiple Agora channels at once (Monitor broadcast-all).
 * Each channel gets its own client and audio track (Agora requires one track per client).
 */
export default function useAgoraMultiPublish({ userId }) {
  const [isRecording, setIsRecording] = useState(false);

  const streamRef = useRef(null);
  const rawStreamRef = useRef(null);
  const denoiseHandleRef = useRef(null);
  const ownsStreamRef = useRef(true);
  const broadcastIdRef = useRef(null);
  const heardBroadcastsRef = useRef(new Set());
  const activeRef = useRef(false);
  /** @type {React.MutableRefObject<Map<string, { key: string, client: import('agora-rtc-sdk-ng').IAgoraRTCClient, track: import('agora-rtc-sdk-ng').ILocalAudioTrack | null, publishStream: MediaStream | null }>>} */
  const sessionsRef = useRef(new Map());
  /** Joined but not publishing — keyed by channel id. */
  const warmSessionsRef = useRef(new Map());
  const warmChannelIdsRef = useRef([]);
  const idleLeaveTimerRef = useRef(null);
  const paramsRef = useRef({ userId });
  paramsRef.current = { userId };

  const clearIdleLeaveTimer = useCallback(() => {
    if (idleLeaveTimerRef.current) {
      clearTimeout(idleLeaveTimerRef.current);
      idleLeaveTimerRef.current = null;
    }
  }, []);

  const releaseWarmSession = useCallback(async (channelId) => {
    const warm = warmSessionsRef.current.get(channelId);
    if (!warm) return;
    warmSessionsRef.current.delete(channelId);
    await releaseAgoraClient(warm.key).catch(() => {});
  }, []);

  const releaseStaleWarmSessions = useCallback(async (keepIds) => {
    const keep = new Set(keepIds);
    const stale = [...warmSessionsRef.current.keys()].filter((id) => !keep.has(id));
    await Promise.all(stale.map((id) => releaseWarmSession(id)));
  }, [releaseWarmSession]);

  const scheduleIdleLeave = useCallback(() => {
    clearIdleLeaveTimer();
    if (activeRef.current || warmChannelIdsRef.current.length > 0) return;
    idleLeaveTimerRef.current = setTimeout(() => {
      if (activeRef.current || warmChannelIdsRef.current.length > 0) return;
      void releaseStaleWarmSessions([]);
    }, IDLE_LEAVE_MS);
  }, [clearIdleLeaveTimer, releaseStaleWarmSessions]);

  const joinChannelOnly = useCallback(async (channelId) => {
    const uid = paramsRef.current.userId;
    if (!uid || !channelId) return null;
    if (sessionsRef.current.has(channelId)) {
      pttDebugLog("agora.multi.join.cached-active", { channelId });
      return sessionsRef.current.get(channelId).client;
    }
    if (warmSessionsRef.current.has(channelId)) {
      pttDebugLog("agora.multi.join.cached-warm", { channelId });
      return warmSessionsRef.current.get(channelId).client;
    }

    pttDebugLog("agora.multi.join.start", { channelId });
    await prepareNativeAgoraAudio();
    const { appId, token, channelName, uid: agoraUid } = await fetchAgoraCredentials(channelId, uid);
    if (!appId || !token) throw new Error("Missing Agora credentials");

    const key = sessionKey(channelName, agoraUid);
    const client = await acquireAgoraClient(key, async (pendingClient) => {
      await pendingClient.join(appId, channelName, token, agoraUid);
    });
    warmSessionsRef.current.set(channelId, { key, client });
    pttDebugLog("agora.multi.join.done", { channelId });
    return client;
  }, []);

  const warmJoinChannels = useCallback(async (channelIds = []) => {
    const uid = paramsRef.current.userId;
    if (!uid) return;

    const ids = [...new Set(channelIds.filter(Boolean))];
    warmChannelIdsRef.current = ids;
    clearIdleLeaveTimer();

    if (ids.length === 0) {
      pttDebugLog("agora.multi.warmJoin.clear", {});
      scheduleIdleLeave();
      return;
    }

    pttDebugLog("agora.multi.warmJoin.start", { channelIds: ids });
    await Promise.all(ids.map((id) => joinChannelOnly(id).catch((err) => {
      console.warn(`Agora warm join failed for ${id}:`, err);
      pttDebugLog("agora.multi.warmJoin.failed", { channelId: id, message: String(err?.message || err) });
    })));
    await releaseStaleWarmSessions(ids);
    pttDebugLog("agora.multi.warmJoin.done", { channelIds: ids });
    scheduleIdleLeave();
  }, [clearIdleLeaveTimer, joinChannelOnly, releaseStaleWarmSessions, scheduleIdleLeave]);

  useEffect(() => () => {
    clearIdleLeaveTimer();
    void releaseStaleWarmSessions([]);
  }, [clearIdleLeaveTimer, releaseStaleWarmSessions]);

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

  const unpublishSession = useCallback(async (channelId, session, { keepWarm = false } = {}) => {
    const { client, key, track, publishStream } = session;
    if (track && client) {
      await client.unpublish([track]).catch(() => {});
      track.stop();
      track.close();
    }
    if (publishStream) {
      publishStream.getTracks().forEach((t) => t.stop());
    }
    sessionsRef.current.delete(channelId);

    if (keepWarm && warmChannelIdsRef.current.includes(channelId)) {
      warmSessionsRef.current.set(channelId, { key, client });
      return;
    }
    await releaseAgoraClient(key).catch(() => {});
  }, []);

  const teardownSessions = useCallback(async ({ stopStream = true } = {}) => {
    const sessions = [...sessionsRef.current.entries()];
    await Promise.all(
      sessions.map(([channelId, session]) =>
        unpublishSession(channelId, session, {
          keepWarm: warmChannelIdsRef.current.includes(channelId),
        })
      )
    );

    if (stopStream) {
      await releaseOwnedStream();
    }
    scheduleIdleLeave();
  }, [releaseOwnedStream, scheduleIdleLeave, unpublishSession]);

  const publishToChannel = useCallback(async (channelId, stream, cloneStream) => {
    const uid = paramsRef.current.userId;
    let key;
    let client;

    const warm = warmSessionsRef.current.get(channelId);
    if (warm) {
      warmSessionsRef.current.delete(channelId);
      key = warm.key;
      client = warm.client;
      pttDebugLog("agora.multi.publish.reuse-warm", { channelId });
    } else {
      const { appId, token, channelName, uid: agoraUid } = await fetchAgoraCredentials(channelId, uid);
      if (!appId || !token) throw new Error("Missing Agora credentials");
      key = sessionKey(channelName, agoraUid);
      client = await acquireAgoraClient(key, async (pendingClient) => {
        await pendingClient.join(appId, channelName, token, agoraUid);
      });
      pttDebugLog("agora.multi.publish.cold-join", { channelId });
    }

    pttDebugLog("agora.multi.publish.start", { channelId });

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
      encoderConfig: AGORA_SPEECH_ENCODER,
    });

    await client.publish([localTrack]);
    pttDebugLog("agora.multi.publish.done", { channelId });
    sessionsRef.current.set(channelId, {
      key,
      client,
      track: localTrack,
      publishStream: publishStream !== stream ? publishStream : null,
    });
  }, []);

  const startRecording = useCallback(async ({ broadcastId, channelIds = [], onStreamReady, sharedStream } = {}) => {
    const uid = paramsRef.current.userId;
    const ids = [...new Set(channelIds.filter(Boolean))];
    if (!uid || ids.length === 0 || activeRef.current) return Boolean(activeRef.current);

    pttDebugLog("agora.multi.record.start", {
      broadcastId: broadcastId ?? null,
      channelIds: ids,
      sharedStream: Boolean(sharedStream),
    });
    clearIdleLeaveTimer();

    try {
      broadcastIdRef.current = broadcastId || crypto.randomUUID();
      heardBroadcastsRef.current.add(broadcastIdRef.current);

      ownsStreamRef.current = !sharedStream;
      let stream = sharedStream;
      const warmJoinPromise = Promise.all(
        ids.map((id) => joinChannelOnly(id).catch(() => null))
      );

      if (!sharedStream) {
        const [opened] = await Promise.all([openMicSession(), warmJoinPromise]);
        stream = opened.publishStream;
        streamRef.current = opened.publishStream;
        rawStreamRef.current = opened.rawStream;
        denoiseHandleRef.current = opened.handle;
        onStreamReady?.(opened.publishStream);
      } else {
        streamRef.current = sharedStream;
        rawStreamRef.current = null;
        denoiseHandleRef.current = null;
        await warmJoinPromise;
      }

      activeRef.current = true;
      setIsRecording(true);

      await Promise.all(
        ids.map((channelId, index) => publishToChannel(channelId, stream, index > 0))
      );

      pttDebugLog("agora.multi.record.done", {
        broadcastId: broadcastIdRef.current,
        channelIds: ids,
      });
      return true;
    } catch (err) {
      console.error("Agora multi-publish failed:", err);
      pttDebugLog("agora.multi.record.failed", { message: String(err?.message || err) });
      activeRef.current = false;
      setIsRecording(false);
      await teardownSessions({ stopStream: true });
      return false;
    }
  }, [clearIdleLeaveTimer, joinChannelOnly, publishToChannel, teardownSessions]);

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
    warmJoinChannels,
    getMediaStream,
    heardBroadcastsRef,
  };
}
