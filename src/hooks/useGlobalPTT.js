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
import usePttBroadcast from "@/hooks/useRelayBroadcast";
import { playBusyTone, playClearTone, unlockAudioForPTT } from "@/lib/pttTones";
import { claimPttChannels, cleanupStalePTTSignals, releasePttSignals } from "@/lib/pttSignals";
import { deviceDayKey } from "@/lib/deviceDate";
import { toast } from "@/lib/toast";
import { recordSessionInteraction } from "@/lib/logoutOnClose";

function resolveGlobalPttChannel(user, channels, passiveTalkChannelId) {
  if (!user?.id || !channels?.length) return null;

  if (canAccessMonitorPage(user)) {
    const sendable = getMonitorChannels(user, channels).filter((channel) =>
      canSendOnChannelForChannel(user, channel)
    );
    if (sendable.length === 0) return null;
    const lastId = localStorage.getItem("lastChannelId");
    return sendable.find((channel) => channel.id === lastId) || sendable[0];
  }

  if (!passiveTalkChannelId) return null;
  const channel = channels.find((c) => c.id === passiveTalkChannelId);
  if (!channel || !canSendOnChannelForChannel(user, channel)) return null;
  return channel;
}

/** App-wide PTT when Talk/Monitor pages are not mounted (headset / media keys). */
export default function useGlobalPTT() {
  const { user, refreshChannelMembership } = useAuth();
  const passiveTalk = usePassiveTalkListen();
  const queryClient = useQueryClient();

  const { data: channels = [] } = useQuery({
    queryKey: ["channels"],
    queryFn: () => api.entities.Channel.list("-created_date", 50),
    enabled: Boolean(user?.id),
  });

  const activeChannel = useMemo(
    () => resolveGlobalPttChannel(user, channels, passiveTalk?.listenChannelId),
    [user, channels, passiveTalk?.listenChannelId]
  );

  const channelId = activeChannel?.id ?? null;
  const canSendPtt = Boolean(
    activeChannel
    && user
    && canSendOnChannelForChannel(user, activeChannel)
    && (bypassesDailyCode(user) || isDailyCodeVerified(user))
  );

  const pttSignalRef = useRef(null);
  const pttRecordingActiveRef = useRef(false);
  const pttStartInFlightRef = useRef(null);
  const pttStopPendingRef = useRef(false);
  const isPTTPressedRef = useRef(false);

  const { startRecording, stopRecording, stopLiveTransmit } = usePttBroadcast({
    channelId,
    userId: user?.id,
    userName: user ? getDisplayName(user) : "",
    listenActive: false,
    receiveEnabled: false,
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!channelId || !user?.id) {
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
      return api.entities.VoiceMessage.create({
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
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", channelId] });
      queryClient.invalidateQueries({ queryKey: ["all-messages"] });
      queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
    },
    onError: (err) => {
      console.warn("Global PTT send failed:", err);
      toast.error("Could not send voice message");
    },
  });

  const finishPttStop = useCallback(() => {
    const signalId = pttSignalRef.current;
    pttSignalRef.current = null;
    if (signalId) {
      api.entities.PTTSignal.delete(signalId).catch(() => {});
    }
    void stopLiveTransmit();
    if (pttRecordingActiveRef.current) {
      pttRecordingActiveRef.current = false;
      sendMutation.mutate();
    }
  }, [sendMutation, stopLiveTransmit]);

  const handlePTTStart = useCallback(async () => {
    if (
      !activeChannel
      || !user?.id
      || !canSendPtt
      || pttStartInFlightRef.current
      || isPTTPressedRef.current
      || pttRecordingActiveRef.current
    ) {
      return;
    }

    if (passiveTalk?.isLiveReceiving) {
      playBusyTone();
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
        const started = await startRecording({ broadcastId });

        if (pttStopPendingRef.current) {
          if (started) {
            pttRecordingActiveRef.current = true;
            return { pendingSend: true };
          }
          return { aborted: true };
        }

        if (!started) {
          return { micDenied: true };
        }

        pttRecordingActiveRef.current = true;

        void cleanupStalePTTSignals({
          channelId,
          excludeSenderId: user.id,
        }).catch(() => {});

        claimPttChannels({
          channelIds: [channelId],
          senderId: user.id,
          senderName: getDisplayName(user),
          broadcastId,
          primaryChannelId: channelId,
        }).then(({ signalIds }) => {
          pttSignalRef.current = signalIds[0] ?? null;
        }).catch(() => {});

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
      if (pttSignalRef.current) {
        await releasePttSignals([pttSignalRef.current]).catch(() => {});
        pttSignalRef.current = null;
      }
      isPTTPressedRef.current = false;
      if (result.micDenied) {
        toast.error("Microphone access denied");
      }
    }
  }, [
    activeChannel,
    user,
    canSendPtt,
    channelId,
    passiveTalk?.isLiveReceiving,
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
      enabled: Boolean(canSendPtt && channelId),
    }),
    [handlePTTStart, handlePTTStop, canSendPtt, channelId]
  );
}
