import { useCallback, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { api } from "@/api/client";
import { auth } from "@/lib/firebase";
import {
  canAccessMonitorPage,
  canSendOnChannelForChannel,
  getDisplayName,
  getMonitorChannels,
  bypassesDailyCode,
} from "@/lib/userUtils";
import { isDailyCodeVerified } from "@/lib/dailyCode";
import { usePassiveTalkListen } from "@/components/ptt/PassiveTalkListenProvider";
import { usePassiveMonitor } from "@/components/monitor/PassiveMonitorProvider";
import usePttBroadcast from "@/hooks/usePttBroadcast";
import { playBusyTone, playClearTone, unlockAudioForPTT } from "@/lib/pttTones";
import { logVoiceMessageFailure } from "@/lib/voiceMessageLogging";
import { claimPttChannels, cleanupStalePTTSignals, releasePttSignals } from "@/lib/pttSignals";
import { deviceDayKey } from "@/lib/deviceDate";
import { toast } from "@/lib/toast";
import { recordSessionInteraction } from "@/lib/logoutOnClose";
import { getLastPttSurface } from "@/lib/lastPttSurface";
import { resolveMonitorTargetChannelIds } from "@/lib/monitorBroadcastSettings";

function resolveTalkChannel(user, channels, passiveTalkChannelId) {
  if (!user?.id || !channels?.length) return null;
  if (!passiveTalkChannelId) return null;
  const channel = channels.find((c) => c.id === passiveTalkChannelId);
  if (!channel || !canSendOnChannelForChannel(user, channel)) return null;
  return channel;
}

function resolveMonitorSendableChannels(user, channels) {
  return getMonitorChannels(user, channels).filter((channel) =>
    canSendOnChannelForChannel(user, channel)
  );
}

/** App-wide PTT fallback when Talk/Monitor pages are not mounted. */
export default function useGlobalPTT() {
  const { user, refreshChannelMembership } = useAuth();
  const passiveTalk = usePassiveTalkListen();
  const passiveMonitor = usePassiveMonitor();
  const queryClient = useQueryClient();
  const lastSurface = getLastPttSurface();
  const monitorMode = lastSurface === "monitor" && canAccessMonitorPage(user);

  const { data: channels = [] } = useQuery({
    queryKey: ["channels"],
    queryFn: () => api.entities.Channel.list("-created_date", 50),
    enabled: Boolean(user?.id),
  });

  const sendableMonitorChannels = useMemo(
    () => (monitorMode ? resolveMonitorSendableChannels(user, channels) : []),
    [monitorMode, user, channels]
  );

  const sendableChannelIds = useMemo(
    () => sendableMonitorChannels.map((channel) => channel.id).filter(Boolean),
    [sendableMonitorChannels]
  );

  const monitorTargetIds = useMemo(
    () => (monitorMode
      ? resolveMonitorTargetChannelIds({ sendableChannelIds, user })
      : []),
    [monitorMode, sendableChannelIds, user]
  );

  const talkChannel = useMemo(
    () => (!monitorMode
      ? resolveTalkChannel(user, channels, passiveTalk?.listenChannelId)
      : null),
    [monitorMode, user, channels, passiveTalk?.listenChannelId]
  );

  const primaryChannelId = monitorMode
    ? (monitorTargetIds[0] ?? sendableChannelIds[0] ?? null)
    : (talkChannel?.id ?? null);

  const canSendPtt = Boolean(
    user
    && (bypassesDailyCode(user) || isDailyCodeVerified(user))
    && primaryChannelId
    && (monitorMode
      ? monitorTargetIds.length > 0
      : talkChannel && canSendOnChannelForChannel(user, talkChannel))
  );

  const pttSignalRef = useRef(null);
  const pttSignalRefs = useRef([]);
  const pttRecordingActiveRef = useRef(false);
  const pttStartInFlightRef = useRef(null);
  const pttStopPendingRef = useRef(false);
  const isPTTPressedRef = useRef(false);

  const { startRecording, stopRecording } = usePttBroadcast({
    channelId: primaryChannelId,
    userId: user?.id,
    userName: user ? getDisplayName(user) : "",
    listenActive: false,
    receiveEnabled: false,
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!primaryChannelId || !user?.id) {
        throw Object.assign(new Error("No active channel"), { code: "app/no-session" });
      }

      await refreshChannelMembership();
      await auth.currentUser?.getIdToken(true);

      const result = await stopRecording();
      if (!result) {
        throw Object.assign(new Error("Recording failed"), { code: "app/recording-failed" });
      }

      const { file_url, duration, broadcast_id } = result;
      const now = new Date();
      const targetIds = monitorMode ? monitorTargetIds : [primaryChannelId];

      try {
        if (monitorMode && targetIds.length > 1) {
          const created = await Promise.all(
            targetIds.map((channelId) =>
              api.entities.VoiceMessage.create({
                channel_id: channelId,
                sender_id: user.id,
                sender_name: getDisplayName(user),
                sender_email: user.email || "",
                audio_url: file_url,
                duration_seconds: Math.round(duration * 10) / 10,
                is_transcribed: false,
                device_time: now.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                }),
                device_date: deviceDayKey(now),
                broadcast_id,
              })
            )
          );
          return created;
        }

        return api.entities.VoiceMessage.create({
          channel_id: primaryChannelId,
          sender_id: user.id,
          sender_name: getDisplayName(user),
          sender_email: user.email || "",
          audio_url: file_url,
          duration_seconds: Math.round(duration * 10) / 10,
          is_transcribed: false,
          device_time: now.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }),
          device_date: deviceDayKey(now),
          broadcast_id,
        });
      } catch (err) {
        err.logged = true;
        void logVoiceMessageFailure({
          source: "global-ptt",
          stage: "create",
          error: err,
          channelId: primaryChannelId,
          channelIds: targetIds,
          broadcastId: broadcast_id,
          durationSeconds: duration,
          user,
          extra: { audio_url: file_url },
        });
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", primaryChannelId] });
      queryClient.invalidateQueries({ queryKey: ["all-messages"] });
      queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
    },
    onError: (err) => {
      if (!err?.logged) {
        const isRecordingStage =
          err?.code === "app/recording-failed" || err?.code === "storage/unauthorized";
        void logVoiceMessageFailure({
          source: "global-ptt",
          stage: isRecordingStage ? "recording" : "create",
          error: err,
          channelId: primaryChannelId,
          user,
        });
      }
      console.warn("Global PTT send failed:", err);
      toast.error("Could not send voice message");
    },
  });

  const finishPttStop = useCallback(() => {
    const signalIds = monitorMode
      ? [...pttSignalRefs.current]
      : (pttSignalRef.current ? [pttSignalRef.current] : []);
    pttSignalRef.current = null;
    pttSignalRefs.current = [];
    signalIds.forEach((id) => {
      api.entities.PTTSignal.delete(id).catch(() => {});
    });

    if (pttRecordingActiveRef.current) {
      pttRecordingActiveRef.current = false;
      sendMutation.mutate();
    }
  }, [monitorMode, sendMutation]);

  const isChannelBusy = useCallback(() => {
    if (monitorMode) {
      return Boolean(passiveMonitor?.isLiveReceiving);
    }
    return Boolean(
      passiveTalk?.isLiveReceiving
      && passiveTalk?.listenChannelId === primaryChannelId
    );
  }, [monitorMode, passiveMonitor?.isLiveReceiving, passiveTalk?.isLiveReceiving, passiveTalk?.listenChannelId, primaryChannelId]);

  const handlePTTStart = useCallback(async () => {
    if (
      !primaryChannelId
      || !user?.id
      || !canSendPtt
      || pttStartInFlightRef.current
      || isPTTPressedRef.current
      || pttRecordingActiveRef.current
    ) {
      return;
    }

    if (isChannelBusy()) {
      playBusyTone();
      return;
    }

    const targetIds = monitorMode ? monitorTargetIds : [primaryChannelId];
    if (targetIds.length === 0) {
      toast.error("No channels available to respond on");
      return;
    }

    recordSessionInteraction();
    unlockAudioForPTT();
    playClearTone();
    isPTTPressedRef.current = true;
    pttStopPendingRef.current = false;
    pttRecordingActiveRef.current = false;

    const startSequence = (async () => {
      const broadcastId = crypto.randomUUID();
      try {
        await auth.currentUser?.getIdToken(true);

        if (monitorMode && pttSignalRefs.current.length) {
          await releasePttSignals(pttSignalRefs.current);
          pttSignalRefs.current = [];
        }

        await cleanupStalePTTSignals({
          channelIds: targetIds,
          channelId: targetIds[0],
          excludeSenderId: user.id,
        }).catch(() => {});

        const claimPromise = claimPttChannels({
          channelIds: targetIds,
          senderId: user.id,
          senderName: getDisplayName(user),
          broadcastId,
          primaryChannelId: targetIds[0],
        });

        const started = await startRecording({
          broadcastId,
          publishChannelIds: monitorMode ? targetIds : undefined,
        });

        if (pttStopPendingRef.current) {
          if (started) {
            pttRecordingActiveRef.current = true;
            return { pendingSend: true };
          }
          return { aborted: true };
        }

        if (!started) {
          if (monitorMode) {
            try {
              const { signalIds } = await claimPromise;
              await releasePttSignals(signalIds);
            } catch {
              /* claim may still be in flight */
            }
          }
          return { micDenied: true };
        }

        pttRecordingActiveRef.current = true;

        if (monitorMode) {
          try {
            const { signalIds } = await claimPromise;
            pttSignalRefs.current = signalIds;
          } catch {
            pttSignalRefs.current = [];
          }
        } else {
          claimPromise.then(({ signalIds }) => {
            pttSignalRef.current = signalIds[0] ?? null;
          }).catch(() => {});
        }

        return { ok: true };
      } catch (error) {
        return { startFailed: true, error };
      }
    })();

    pttStartInFlightRef.current = startSequence;
    const result = await startSequence;
    pttStartInFlightRef.current = null;
    const cancelled = pttStopPendingRef.current;
    pttStopPendingRef.current = false;

    if (result.pendingSend) {
      isPTTPressedRef.current = false;
      finishPttStop();
      return;
    }

    if (result.aborted || cancelled) {
      isPTTPressedRef.current = false;
      return;
    }

    if (result.startFailed || result.micDenied) {
      await stopRecording().catch(() => {});
      if (monitorMode) {
        await releasePttSignals(pttSignalRefs.current).catch(() => {});
        pttSignalRefs.current = [];
      } else if (pttSignalRef.current) {
        await releasePttSignals([pttSignalRef.current]).catch(() => {});
        pttSignalRef.current = null;
      }
      isPTTPressedRef.current = false;
      if (result.micDenied) {
        toast.error("Microphone access denied");
      }
    }
  }, [
    primaryChannelId,
    user,
    canSendPtt,
    monitorMode,
    monitorTargetIds,
    isChannelBusy,
    startRecording,
    stopRecording,
    finishPttStop,
  ]);

  const handlePTTStop = useCallback(() => {
    if (pttStartInFlightRef.current) {
      pttStopPendingRef.current = true;
      isPTTPressedRef.current = false;
      return;
    }
    if (!isPTTPressedRef.current && !pttRecordingActiveRef.current) return;
    isPTTPressedRef.current = false;
    finishPttStop();
  }, [finishPttStop]);

  return useMemo(
    () => ({
      onPress: handlePTTStart,
      onRelease: handlePTTStop,
      enabled: Boolean(canSendPtt && primaryChannelId),
    }),
    [handlePTTStart, handlePTTStop, canSendPtt, primaryChannelId]
  );
}
