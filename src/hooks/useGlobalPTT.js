import { useCallback, useMemo, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { api } from "@/api/client";
import {
  canAccessMonitorPage,
  canSendOnChannelForChannel,
  getDisplayName,
  getMonitorChannels,
  bypassesDailyCode,
} from "@/lib/userUtils";
import { isDailyCodeVerified } from "@/lib/dailyCode";
import { usePassiveTalkListen } from "@/components/ptt/PassiveTalkListenProvider";
import usePttBroadcast from "@/hooks/usePttBroadcast";
import usePttBusyChannels from "@/hooks/usePttBusyChannels";
import useChannels from "@/hooks/useChannels";
import { ensurePttAccess, invalidatePttAccess } from "@/lib/pttAccessCache";
import { playBusyTone, playClearTone, unlockAudioForPTT } from "@/lib/pttTones";
import { logVoiceMessageFailure } from "@/lib/voiceMessageLogging";
import { claimPttChannels, cleanupStalePTTSignals, releasePttSignals } from "@/lib/pttSignals";
import { deviceDayKey } from "@/lib/deviceDate";
import { toast } from "@/lib/toast";
import { recordSessionInteraction } from "@/lib/logoutOnClose";
import { getLastPttSurface } from "@/lib/lastPttSurface";
import { resolveMonitorTargetChannelIds } from "@/lib/monitorBroadcastSettings";
import { pttDebugLog } from "@/lib/pttDebugLog";

function resolveTalkChannel(user, channels, passiveTalkChannelId) {
  if (!user?.id || !channels?.length) return null;

  const resolveCandidate = (channelId) => {
    if (!channelId) return null;
    const channel = channels.find((c) => c.id === channelId);
    if (!channel || !canSendOnChannelForChannel(user, channel)) return null;
    return channel;
  };

  const fromPassive = resolveCandidate(passiveTalkChannelId);
  if (fromPassive) return fromPassive;

  try {
    const stored = localStorage.getItem("lastChannelId");
    return resolveCandidate(stored);
  } catch {
    return null;
  }
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
  const queryClient = useQueryClient();
  const lastSurface = getLastPttSurface();
  const monitorMode = lastSurface === "monitor" && canAccessMonitorPage(user);

  const { data: channels = [] } = useChannels({ enabled: Boolean(user?.id) });

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
  const pttMaxDurationStopRef = useRef(() => {});

  const busyWatchIds = useMemo(
    () => (monitorMode ? monitorTargetIds : (primaryChannelId ? [primaryChannelId] : [])),
    [monitorMode, monitorTargetIds, primaryChannelId]
  );
  const { isAnyChannelBusy } = usePttBusyChannels({
    channelIds: busyWatchIds,
    userId: user?.id ?? null,
    enabled: Boolean(user?.id && busyWatchIds.length > 0),
  });

  const { startRecording, stopRecording, stopLiveTransmit } = usePttBroadcast({
    channelId: primaryChannelId,
    userId: user?.id,
    userName: user ? getDisplayName(user) : "",
    listenActive: false,
    receiveEnabled: false,
    warmJoin: false,
    warmPublishChannelIds: monitorMode ? monitorTargetIds : (primaryChannelId ? [primaryChannelId] : []),
    onMaxDurationRef: pttMaxDurationStopRef,
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!primaryChannelId || !user?.id) {
        throw Object.assign(new Error("No active channel"), { code: "app/no-session" });
      }

      await ensurePttAccess({
        userId: user.id,
        channelId: primaryChannelId,
        refreshMembership: refreshChannelMembership,
      });

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
      if (err?.code === "permission-denied" || err?.code === "auth/not-authenticated") {
        invalidatePttAccess(user?.id, primaryChannelId);
      }
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
      return;
    }

    void stopLiveTransmit();
    void stopRecording().catch(() => {});
  }, [monitorMode, sendMutation, stopLiveTransmit, stopRecording]);

  const isChannelBusy = useCallback(
    () => isAnyChannelBusy(busyWatchIds),
    [isAnyChannelBusy, busyWatchIds]
  );

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
    const broadcastId = crypto.randomUUID();
    playClearTone(broadcastId);

    isPTTPressedRef.current = true;
    pttStopPendingRef.current = false;
    pttRecordingActiveRef.current = false;

    pttDebugLog("ptt.press", {
      surface: monitorMode ? "global-monitor" : "global-talk",
      channelIds: targetIds,
      broadcastId,
    });

    const startSequence = (async () => {
      pttDebugLog("ptt.sequence.start", {
        surface: monitorMode ? "global-monitor" : "global-talk",
        broadcastId,
        channelIds: targetIds,
      });
      try {
        if (monitorMode && pttSignalRefs.current.length) {
          await releasePttSignals(pttSignalRefs.current);
          pttSignalRefs.current = [];
        }

        void ensurePttAccess({
          userId: user.id,
          channelId: targetIds[0] ?? null,
          refreshMembership: refreshChannelMembership,
        }).catch(() => {});

        void cleanupStalePTTSignals({
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
        pttDebugLog("ptt.claim.sent", {
          surface: monitorMode ? "global-monitor" : "global-talk",
          broadcastId,
          channelIds: targetIds,
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
      if (pttRecordingActiveRef.current || cancelled) {
        finishPttStop();
      }
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
    refreshChannelMembership,
  ]);

  const handlePTTStop = useCallback(() => {
    if (pttStartInFlightRef.current) {
      pttStopPendingRef.current = true;
      isPTTPressedRef.current = false;
      return;
    }
    isPTTPressedRef.current = false;
    finishPttStop();
  }, [finishPttStop]);

  pttMaxDurationStopRef.current = () => {
    toast.info("Maximum transmission time reached (35 seconds)");
    isPTTPressedRef.current = false;
    pttStopPendingRef.current = false;
    void stopLiveTransmit();
    if (pttRecordingActiveRef.current) {
      finishPttStop();
    } else {
      void stopRecording().catch(() => {});
    }
  };

  return useMemo(
    () => ({
      onPress: handlePTTStart,
      onRelease: handlePTTStop,
      enabled: Boolean(canSendPtt && primaryChannelId),
    }),
    [handlePTTStart, handlePTTStop, canSendPtt, primaryChannelId]
  );
}
