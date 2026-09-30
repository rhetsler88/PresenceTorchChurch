import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/api/client";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import PTTButton from "../components/ptt/PTTButton";
import ChannelHeader from "../components/ptt/ChannelHeader";
import MessageFeed from "../components/ptt/MessageFeed";
import ProtectionLevelBadge from "../components/ptt/ProtectionLevelBadge";
import TextInputBar from "../components/ptt/TextInputBar";
import usePttBroadcast from "../hooks/usePttBroadcast";
import usePttBusyChannels from "@/hooks/usePttBusyChannels";
import useChannels from "@/hooks/useChannels";
import { ensurePttAccess, invalidatePttAccess } from "@/lib/pttAccessCache";
import {
  usePassiveTalkListen,
  usePassiveTalkListenRegistration,
} from "../components/ptt/PassiveTalkListenProvider";
import {
  usePassiveMonitor,
  useMonitorTalkListenRegistration,
} from "../components/monitor/PassiveMonitorProvider";
import { useRegisterPagePTTHandlers } from "@/components/ptt/PTTHandlerProvider";
import { playClearTone, playBusyTone, unlockAudioForPTT } from "@/lib/pttTones";
import { logVoiceMessageFailure } from "@/lib/voiceMessageLogging";
import {
  cleanupStalePTTSignals,
  claimPttChannels,
  discardPttRecording,
  releasePttSignals,
} from "@/lib/pttSignals";
import { pttDebugLog } from "@/lib/pttDebugLog";
import { PTT_MAX_TRANSMISSION_MS } from "@/lib/pttLimits";
import { playAudioUrl, stopAudio } from "@/lib/audioPlayer";
import { formatAudioPlaybackToast } from "@/lib/secureAudio";
import { needsTranscription, requestTranscription } from "@/lib/transcription";
import { deviceDayKey } from "@/lib/deviceDate";
import {
  getDisplayName,
  canAccessChannel,
  isPlatformAdmin,
  canReadVoiceMessageForChannel,
  bypassesDailyCode,
  canAccessMonitorPage,
} from "@/lib/userUtils";
import { isDailyCodeVerified } from "@/lib/dailyCode";
import { assertCanSendText, canSendText } from "@/lib/talkSendGate";
import { useRegisterTalkPresence } from "@/components/presence/PresenceProvider";
import useChannelPresence from "@/hooks/useChannelPresence";
import { useAuth } from "@/lib/AuthContext";
import {
  ensureUserChannelMembership,
  userHasFirestoreChannelAccess,
} from "@/lib/channelMembership";
import { toast } from "@/lib/toast";
import { recordSessionInteraction } from "@/lib/logoutOnClose";
import { assertPlayableSendPayload } from "@/lib/playableSendPayload";
import { createVoiceMessageArchive } from "@/lib/voiceMessageArchive";
import { resolveChannelSwitch } from "@/lib/channelSwitchDuringPtt";
import { Button } from "@/components/ui/button";
import { Clock, Trash2, CheckSquare } from "lucide-react";

function describePermissionFailure(user) {
  if (!user) return "Sign in again and retry.";
  if (!isDailyCodeVerified(user)) {
    return "Enter today's daily access code, then retry.";
  }
  return "Channel access may be out of sync — sign out and back in, or ask an admin to repair your account.";
}

export default function Talk() {
  const { user, refreshChannelMembership } = useAuth();
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const [isReceiving, setIsReceiving] = useState(false);
  const [isPTTPressed, setIsPTTPressed] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const queryClient = useQueryClient();
  const feedEndRef = useRef(null);
  const pttSignalRef = useRef(null);
  const pttRecordingActiveRef = useRef(false);
  const isPTTPressedRef = useRef(false);
  const pttStartInFlightRef = useRef(null);
  const pttStopPendingRef = useRef(false);
  const pttSessionChannelIdRef = useRef(null);
  const pttSessionUserRef = useRef(null);
  const pendingChannelIdRef = useRef(null);
  const receivingTimeoutRef = useRef(null);
  const pttMaxDurationStopRef = useRef(() => {});

  const [searchParams] = useSearchParams();
  const channelParam = searchParams.get("channel");

  const { data: channels = [] } = useChannels();

  // Approved members, plus org/platform admins who manage those channels
  const myChannels = useMemo(
    () => channels.filter((channel) => canAccessChannel(user, channel)),
    [channels, user]
  );

  const activeChannel = useMemo(
    () => myChannels.find((c) => c.id === activeChannelId) ?? myChannels[0] ?? null,
    [myChannels, activeChannelId]
  );
  const effectiveChannelId = activeChannel?.id ?? null;
  const canReadMessages = Boolean(
    activeChannel && user && canReadVoiceMessageForChannel(user, activeChannel)
  );
  const canSendPtt = canSendText(user, activeChannel);
  const canPublishPresence = Boolean(
    effectiveChannelId
    && user
    && (bypassesDailyCode(user) || isDailyCodeVerified(user))
  );
  const canViewPresence = Boolean(
    effectiveChannelId
    && user
    && canReadMessages
    && (bypassesDailyCode(user) || isDailyCodeVerified(user))
  );
  const { onlineMembers, onlineCount } = useChannelPresence(effectiveChannelId, {
    enabled: canViewPresence,
    includeCurrentUser: canPublishPresence,
  });
  useRegisterTalkPresence(canPublishPresence ? effectiveChannelId : null);
  const canQueryFirestore = Boolean(
    effectiveChannelId &&
    user &&
    canReadMessages &&
    userHasFirestoreChannelAccess(user, effectiveChannelId, activeChannel)
  );

  const messagesQueryKey = useMemo(
    () => ["messages", effectiveChannelId, user?.id, canReadMessages, canQueryFirestore],
    [effectiveChannelId, user?.id, canReadMessages, canQueryFirestore]
  );

  // Backfill users/{uid}.member_of_channels when approved on channel but not yet on user doc.
  useEffect(() => {
    if (!user?.id) return;
    refreshChannelMembership().catch((err) => {
      console.warn("Talk membership refresh failed:", err);
    });
  }, [user?.id, refreshChannelMembership]);

  useEffect(() => {
    if (!user?.id || !activeChannel || !effectiveChannelId) return;
    if (userHasFirestoreChannelAccess(user, effectiveChannelId, activeChannel)) return;

    let cancelled = false;
    (async () => {
      try {
        const added = await ensureUserChannelMembership(
          user.id,
          user.email,
          activeChannel
        );
        if (cancelled || !added) return;
        await refreshChannelMembership();
        queryClient.invalidateQueries({ queryKey: ["messages", effectiveChannelId] });
      } catch (err) {
        console.warn("Channel membership ensure failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    user?.id,
    user?.email,
    activeChannel,
    effectiveChannelId,
    refreshChannelMembership,
    queryClient,
  ]);

  const hasPassiveMonitor = canAccessMonitorPage(user);
  const passiveTalk = usePassiveTalkListen();
  const passiveMonitor = usePassiveMonitor();

  usePassiveTalkListenRegistration({
    channelId: effectiveChannelId,
    title: activeChannel?.name || "Talk",
    canRead: !hasPassiveMonitor && canReadMessages,
    listenPaused: isPTTPressed,
    persist: true,
  });

  useMonitorTalkListenRegistration(
    hasPassiveMonitor && canReadMessages ? effectiveChannelId : null
  );

  const {
    startRecording,
    stopRecording,
    retryLastSend,
    stopLiveTransmit,
    isRecording,
  } = usePttBroadcast({
    channelId: effectiveChannelId,
    userId: user?.id,
    userName: user ? getDisplayName(user) : "",
    userEmail: user?.email || "",
    listenActive: false,
    receiveEnabled: false,
    warmJoin: false,
    onMaxDurationRef: pttMaxDurationStopRef,
  });

  const watchedChannelIds = useMemo(
    () => (effectiveChannelId ? [effectiveChannelId] : []),
    [effectiveChannelId]
  );
  const { isAnyChannelBusy } = usePttBusyChannels({
    channelIds: watchedChannelIds,
    userId: user?.id ?? null,
    enabled: Boolean(canReadMessages && canQueryFirestore),
  });
  const signalBusy = isAnyChannelBusy(watchedChannelIds);
  const channelLiveActive = hasPassiveMonitor
    ? Boolean(
        passiveMonitor?.isLiveReceiving
        && effectiveChannelId
        && passiveMonitor?.listenChannelIds?.includes(effectiveChannelId)
      ) || signalBusy
    : Boolean(
        passiveTalk?.isLiveReceiving
        && passiveTalk?.listenChannelId === effectiveChannelId
      );

  const isPttTransmitting = useCallback(() => (
    isPTTPressedRef.current
    || Boolean(pttStartInFlightRef.current)
    || pttRecordingActiveRef.current
  ), []);

  const flushPendingChannelSelection = useCallback(() => {
    const resolved = resolveChannelSwitch({
      settle: true,
      pendingId: pendingChannelIdRef.current,
      isTransmitting: isPttTransmitting(),
    });
    if (resolved.pendingId !== undefined) {
      pendingChannelIdRef.current = resolved.pendingId;
    }
    if (resolved.action === "apply" && resolved.channelId != null) {
      setActiveChannelId(resolved.channelId);
    }
  }, [isPttTransmitting]);

  const requestActiveChannelId = useCallback((requestedId) => {
    const resolved = resolveChannelSwitch({
      requestedId,
      currentId: activeChannelId,
      isTransmitting: isPttTransmitting(),
      pendingId: pendingChannelIdRef.current,
    });
    if (resolved.pendingId !== undefined) {
      pendingChannelIdRef.current = resolved.pendingId;
    }
    if (resolved.action === "apply") {
      setActiveChannelId(resolved.channelId ?? null);
    }
  }, [activeChannelId, isPttTransmitting]);

  // Auto-select channel from URL param, last selected, or first approved channel
  useEffect(() => {
    if (myChannels.length === 0) return;

    const fromUrl = channelParam && myChannels.find((c) => c.id === channelParam);
    if (fromUrl) {
      if (activeChannelId !== fromUrl.id) {
        requestActiveChannelId(fromUrl.id);
      }
      return;
    }

    if (!activeChannelId) {
      const fromStorage = localStorage.getItem("lastChannelId");
      const fromLast = fromStorage && myChannels.find((c) => c.id === fromStorage);
      const fallback = myChannels[0].id;
      requestActiveChannelId(fromLast ? fromLast.id : fallback);
    }
  }, [myChannels, activeChannelId, channelParam, requestActiveChannelId]);

  // Drop stale selection when membership or admin scope changes
  useEffect(() => {
    if (!user) return;
    if (activeChannelId && !myChannels.some((c) => c.id === activeChannelId)) {
      requestActiveChannelId(myChannels[0]?.id ?? null);
    }
  }, [user, myChannels, activeChannelId, requestActiveChannelId]);

  // Persist channel selection
  useEffect(() => {
    if (activeChannelId) localStorage.setItem("lastChannelId", activeChannelId);
  }, [activeChannelId]);

  const { data: messages = [] } = useQuery({
    queryKey: messagesQueryKey,
    queryFn: async () => {
      if (!effectiveChannelId || !canReadMessages) return [];
      try {
        return await api.entities.VoiceMessage.filter(
          { channel_id: effectiveChannelId },
          "-created_date",
          50
        );
      } catch (err) {
        if (err?.code === "permission-denied") return [];
        throw err;
      }
    },
    enabled: !!effectiveChannelId && !!user?.id && canReadMessages && canQueryFirestore,
    placeholderData: keepPreviousData,
    refetchInterval: 15000,
  });

  const sortedMessages = [...messages].reverse();

  const canDelete = isPlatformAdmin(user);

  const handleEnterSelection = useCallback((msgId) => {
    if (!canDelete) return;
    stopAudio();
    if (receivingTimeoutRef.current) {
      clearTimeout(receivingTimeoutRef.current);
      receivingTimeoutRef.current = null;
    }
    setPlayingId(null);
    setIsReceiving(false);
    setSelectionMode(true);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(msgId);
      return next;
    });
  }, [canDelete]);

  const handleToggleSelect = useCallback((msgId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  }, []);

  const handleCancelSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const deleteMessagesMutation = useMutation({
    mutationFn: async (/** @type {string[]} */ ids) => {
      await api.entities.VoiceMessage.deleteAsModerator(ids);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
      queryClient.invalidateQueries({ queryKey: ["all-messages"] });
      setSelectionMode(false);
      setSelectedIds(new Set());
      toast.success("Messages deleted");
    },
    onError: (err) => {
      console.error("Delete messages failed:", err);
      if (err?.code === "permission-denied") {
        toast.error("Permission denied — confirm your account role is admin or team lead.");
        return;
      }
      toast.error("Could not delete messages. Please try again.");
    },
  });

  const handleEnterSelectionMode = useCallback(() => {
    if (!canDelete) return;
    stopAudio();
    if (receivingTimeoutRef.current) {
      clearTimeout(receivingTimeoutRef.current);
      receivingTimeoutRef.current = null;
    }
    setPlayingId(null);
    setIsReceiving(false);
    setSelectionMode(true);
    setSelectedIds(new Set());
  }, [canDelete]);

  const mergeChannelMessage = useCallback((message) => {
    if (!message?.id || !effectiveChannelId) return;
    if (message.channel_id && message.channel_id !== effectiveChannelId) return;
    queryClient.setQueryData(messagesQueryKey, (old = []) => {
      const list = Array.isArray(old) ? old : [];
      const idx = list.findIndex((m) => m.id === message.id);
      if (idx === -1) return [message, ...list];
      const next = [...list];
      next[idx] = { ...next[idx], ...message };
      return next;
    });
  }, [effectiveChannelId, messagesQueryKey, queryClient]);

  // Subscribe to channel messages — merge creates/updates locally; avoid refetching Talk feed (prevents wipe races)
  useEffect(() => {
    if (!effectiveChannelId || !canReadMessages || !canQueryFirestore) return;
    const unsub = api.entities.VoiceMessage.subscribe(
      (event) => {
        if (event.data?.channel_id !== effectiveChannelId) return;

        if (event.type === "create" || event.type === "update") {
          mergeChannelMessage(event.data);
          queryClient.invalidateQueries({ queryKey: ["all-messages"] });
          queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
        }
      },
      { channel_id: effectiveChannelId }
    );
    return unsub;
  }, [effectiveChannelId, canReadMessages, canQueryFirestore, queryClient, user, mergeChannelMessage]);

  // Clean up PTT signal on channel change, tab close, or unmount
  useEffect(() => {
    const deleteOwnSignal = () => {
      if (!pttSignalRef.current) return;
      const signalId = pttSignalRef.current;
      pttSignalRef.current = null;
      api.entities.PTTSignal.delete(signalId).catch(() => {});
    };

    const handlePageExit = () => deleteOwnSignal();
    window.addEventListener("pagehide", handlePageExit);

    return () => {
      window.removeEventListener("pagehide", handlePageExit);
      deleteOwnSignal();
    };
  }, [effectiveChannelId]);

  // Subscribe to channel updates (sync protection level from Monitor)
  useEffect(() => {
    const unsub = api.entities.Channel.subscribe((event) => {
      if (event.type === "update") {
        queryClient.invalidateQueries({ queryKey: ["channels"] });
      }
    });
    return unsub;
  }, [queryClient]);

  // Auto-scroll
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sortedMessages.length]);

  const ensureFirestoreMembership = useCallback(async ({ force = false } = {}) => {
    if (!user?.id || !activeChannel || !effectiveChannelId) return;
    await ensurePttAccess({
      userId: user.id,
      channelId: effectiveChannelId,
      force,
      refreshMembership: refreshChannelMembership,
      ensureMembership: async () => {
        const added = await ensureUserChannelMembership(
          user.id,
          user.email,
          activeChannel
        );
        if (added) await refreshChannelMembership();
      },
    });
  }, [user, activeChannel, effectiveChannelId, refreshChannelMembership]);

  const sendMutation = useMutation({
    mutationFn: async ({ channelId: sessionChannelId, sessionUser } = {}) => {
      const channelId = sessionChannelId || pttSessionChannelIdRef.current || effectiveChannelId;
      const resolvedUser = sessionUser || pttSessionUserRef.current || user;

      if (!channelId || !resolvedUser?.id) {
        throw Object.assign(new Error("No active channel or user session"), {
          code: "app/no-session",
        });
      }

      let recordingFinalized = false;
      try {
        await ensureFirestoreMembership();

        const result = assertPlayableSendPayload(await stopRecording());
        recordingFinalized = true;

        const { broadcast_id } = result;
        let msg;
        try {
          msg = await createVoiceMessageArchive({
            channelId,
            user: resolvedUser,
            result,
          });
        } catch (err) {
          err.logged = true;
          void logVoiceMessageFailure({
            source: "talk",
            stage: "create",
            error: err,
            channelId,
            broadcastId: broadcast_id,
            durationSeconds: result.duration,
            user: resolvedUser,
            extra: { audio_url: result.file_url, retryable: err.retryable === true },
          });
          throw err;
        }

        // Clean up relay chunks (best-effort; only admins can delete in rules)
        if (broadcast_id) {
          api.entities.AudioChunk.deleteMany({ broadcast_id }).catch(() => {});
        }

        return msg;
      } catch (err) {
        if (!recordingFinalized) {
          err.logged = true;
          void logVoiceMessageFailure({
            source: "talk",
            stage: "membership-sync",
            error: err,
            channelId,
            user: resolvedUser,
          });
          await discardPttRecording(stopRecording, {
            source: "talk",
            channelId,
            user: resolvedUser,
            reason: "Talk send failed before recorder stop (membership or pre-stop error)",
          });
          void stopLiveTransmit();
        }
        throw err;
      }
    },
    onSuccess: (msg) => {
      if (!msg) return;
      mergeChannelMessage(msg);
      queryClient.invalidateQueries({ queryKey: ["all-messages"] });
      queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
    },
    onSettled: () => {
      pttSessionChannelIdRef.current = null;
      pttSessionUserRef.current = null;
      flushPendingChannelSelection();
    },
    onError: (err) => {
      const channelId = pttSessionChannelIdRef.current || effectiveChannelId;
      if (err?.code === "permission-denied" || err?.code === "auth/not-authenticated") {
        invalidatePttAccess(user?.id, channelId);
      }
      if (!err?.logged) {
        const isRecordingStage =
          err?.code === "app/recording-failed"
          || err?.code === "app/upload-failed"
          || err?.code === "storage/unauthorized";
        void logVoiceMessageFailure({
          source: "talk",
          stage: isRecordingStage ? "recording" : "create",
          error: err,
          channelId,
          user,
          extra: err?.retryable === true ? { retryable: true } : undefined,
        });
      }
      console.error("Voice message send failed:", err, {
        channelId,
        userId: user?.id,
        code: err?.code,
      });
      if (err?.code === "auth/not-authenticated") {
        toast.error("Session expired — please sign in again");
        return;
      }
      if (err?.code === "app/upload-failed") {
        toast.error(err.message || "Audio upload did not return a playable URL", {
          action: {
            label: "Retry",
            onClick: () => retryArchiveSendMutation.mutate(),
          },
        });
        return;
      }
      if (err?.code === "app/recording-failed") {
        toast.error("Recording failed — message not sent");
        return;
      }
      if (err?.code === "storage/unauthorized") {
        toast.error("Permission denied — could not upload voice message audio");
        return;
      }
      if (err?.code === "app/no-session") {
        toast.error("Could not send — try selecting the channel again");
        return;
      }
      toast.error(err?.code === "permission-denied" || err?.message?.includes("permission")
        ? `Permission denied — ${describePermissionFailure(user)}`
        : "Could not send voice message");
    },
  });

  const retryArchiveSendMutation = useMutation({
    mutationFn: () => retryLastSend(),
    onSuccess: (msg) => {
      if (!msg) return;
      mergeChannelMessage(msg);
      queryClient.invalidateQueries({ queryKey: ["all-messages"] });
      queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
      toast.success("Message saved to history");
    },
    onError: (err) => {
      console.error("Voice message archive retry failed:", err);
      void logVoiceMessageFailure({
        source: "talk",
        stage: "recording",
        error: err,
        channelId: effectiveChannelId,
        user,
        extra: err?.retryable === true ? { retryable: true } : undefined,
      });
      if (err?.code === "app/no-retry") {
        toast.error("Nothing to retry — record a new message");
        return;
      }
      if (err?.code === "app/upload-failed") {
        toast.error(err.message || "Audio upload did not return a playable URL", {
          action: {
            label: "Retry",
            onClick: () => retryArchiveSendMutation.mutate(),
          },
        });
        return;
      }
      toast.error("Could not save message to history");
    },
  });

  const sendTextMutation = useMutation({
    mutationFn: async (text) => {
      assertCanSendText(user, activeChannel);
      await ensureFirestoreMembership();
      const now = new Date();
      return api.entities.VoiceMessage.create({
        channel_id: effectiveChannelId,
        sender_name: getDisplayName(user),
        sender_email: user?.email || "",
        text_content: text,
        is_transcribed: true,
        device_time: now.toLocaleTimeString('en-US', {
          hour: 'numeric', minute: '2-digit', hour12: true
        }),
        device_date: deviceDayKey(now),
      });
    },
    onSuccess: (msg) => {
      if (!msg) return;
      recordSessionInteraction();
      mergeChannelMessage(msg);
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
      queryClient.invalidateQueries({ queryKey: ["all-messages"] });
      queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
    },
    onError: (err) => {
      console.error("Text message send failed:", err);
      if (err?.code === "daily-code-required") {
        toast.error(err.message);
        return;
      }
      toast.error(err?.code === "permission-denied" || err?.message?.includes("permission")
        ? `Permission denied — ${describePermissionFailure(user)}`
        : err?.message || "Could not send text message");
    },
  });

  const transcribeOnReplay = useCallback(async (msg) => {
    if (!needsTranscription(msg)) return;
    try {
      const transcript = await requestTranscription(msg);
      if (transcript && msg.channel_id) {
        mergeChannelMessage({
          id: msg.id,
          channel_id: msg.channel_id,
          transcript,
          is_transcribed: true,
        });
        queryClient.invalidateQueries({ queryKey: ["all-messages"] });
        queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
      }
    } catch {
      // Firestore subscribe will pick up server-side updates if any.
    }
  }, [mergeChannelMessage, queryClient]);

  const finishPttStop = useCallback(() => {
    const signalId = pttSignalRef.current;
    pttSignalRef.current = null;
    if (signalId) {
      api.entities.PTTSignal.delete(signalId).catch(() => {});
    }

    if (pttRecordingActiveRef.current) {
      pttRecordingActiveRef.current = false;
      sendMutation.mutate({
        channelId: pttSessionChannelIdRef.current || effectiveChannelId,
        sessionUser: pttSessionUserRef.current || user,
      });
      pttSessionChannelIdRef.current = null;
      pttSessionUserRef.current = null;
      return;
    }

    // Mic may be live before pttRecordingActiveRef is set (race during start).
    void stopLiveTransmit();
    void discardPttRecording(stopRecording, {
      source: "talk",
      channelId: pttSessionChannelIdRef.current || effectiveChannelId,
      user: pttSessionUserRef.current || user,
      reason: "PTT released before recording was committed",
    });
    pttSessionChannelIdRef.current = null;
    pttSessionUserRef.current = null;
    flushPendingChannelSelection();
  }, [sendMutation, effectiveChannelId, user, stopLiveTransmit, stopRecording, flushPendingChannelSelection]);

  const releasePttSignal = useCallback((signalId) => {
    if (!signalId) return;
    api.entities.PTTSignal.delete(signalId).catch(() => {});
    if (pttSignalRef.current === signalId) {
      pttSignalRef.current = null;
    }
  }, []);

  const handlePTTStart = useCallback(async () => {
    if (
      !activeChannel
      || !user?.id
      || !canSendPtt
      || pttStartInFlightRef.current
      || isPTTPressedRef.current
    ) {
      return;
    }
    if (pttRecordingActiveRef.current) {
      if (isRecording) return;
      pttRecordingActiveRef.current = false;
    }
    if (signalBusy || channelLiveActive) {
      playBusyTone();
      return;
    }

    recordSessionInteraction();
    unlockAudioForPTT();
    const broadcastId = crypto.randomUUID();
    const clearToneDone = playClearTone(broadcastId);

    pttSessionChannelIdRef.current = effectiveChannelId;
    pttSessionUserRef.current = user;
    isPTTPressedRef.current = true;
    setIsPTTPressed(true);
    pttStopPendingRef.current = false;
    pttRecordingActiveRef.current = false;

    pttDebugLog("ptt.press", { surface: "talk", channelId: effectiveChannelId, broadcastId });

    const startSequence = (async () => {
      pttDebugLog("ptt.sequence.start", { surface: "talk", broadcastId, channelId: effectiveChannelId });
      try {
        void cleanupStalePTTSignals({
          channelId: effectiveChannelId,
          excludeSenderId: user.id,
        }).catch(() => {});

        void ensureFirestoreMembership().catch((syncErr) => {
          console.warn("PTT access sync failed:", syncErr);
        });

        if (pttStopPendingRef.current) {
          return { aborted: true };
        }

        pttDebugLog("ptt.claim.sent", { surface: "talk", broadcastId, channelIds: [effectiveChannelId] });
        const claimResult = await claimPttChannels({
          channelIds: [effectiveChannelId],
          senderId: user.id,
          senderName: getDisplayName(user),
          broadcastId,
          primaryChannelId: effectiveChannelId,
        });

        if (!claimResult.won) {
          return { channelBusy: true, holder: claimResult.holder };
        }

        if (pttStopPendingRef.current) {
          await releasePttSignals(claimResult.signalIds);
          return { aborted: true };
        }

        pttSignalRef.current = claimResult.signalIds[0] ?? null;

        await clearToneDone;
        const started = await startRecording({ broadcastId });

        if (pttStopPendingRef.current) {
          if (started) {
            pttRecordingActiveRef.current = true;
            return { pendingSend: true };
          }
          await releasePttSignals(claimResult.signalIds);
          pttSignalRef.current = null;
          await discardPttRecording(stopRecording, {
            source: "talk",
            channelId: effectiveChannelId,
            user,
            reason: "PTT released during startup before mic was ready",
          });
          return { aborted: true };
        }

        if (!started) {
          await releasePttSignals(claimResult.signalIds);
          pttSignalRef.current = null;
          await discardPttRecording(stopRecording, {
            source: "talk",
            channelId: effectiveChannelId,
            user,
            reason: "Microphone unavailable after channel claim",
          });
          return { micDenied: true };
        }

        pttRecordingActiveRef.current = true;
        return { ok: true };
      } catch (e) {
        return { startFailed: true, error: e };
      }
    })();

    pttStartInFlightRef.current = startSequence;

    const result = await startSequence;
    pttStartInFlightRef.current = null;
    const cancelled = pttStopPendingRef.current;
    pttStopPendingRef.current = false;

    if (result.pendingSend) {
      isPTTPressedRef.current = false;
      setIsPTTPressed(false);
      finishPttStop();
      return;
    }

    if (result.aborted || cancelled) {
      isPTTPressedRef.current = false;
      setIsPTTPressed(false);
      if (pttRecordingActiveRef.current || cancelled) {
        finishPttStop();
      } else {
        flushPendingChannelSelection();
      }
      return;
    }

    if (result.channelBusy) {
      isPTTPressedRef.current = false;
      setIsPTTPressed(false);
      playBusyTone();
      toast.error("Channel busy");
      flushPendingChannelSelection();
      return;
    }

    if (result.startFailed) {
      console.error("PTT start failed:", result.error);
      await releasePttSignals(pttSignalRef.current ? [pttSignalRef.current] : []);
      releasePttSignal(pttSignalRef.current);
      await discardPttRecording(stopRecording, {
        source: "talk",
        channelId: effectiveChannelId,
        user,
        reason: "PTT startup failed after claim",
      });
      isPTTPressedRef.current = false;
      setIsPTTPressed(false);
      toast.error(
        result.error?.code === "permission-denied"
          ? "Permission denied — cannot claim this channel"
          : "Could not start transmission"
      );
      flushPendingChannelSelection();
      return;
    }

    if (result.micDenied) {
      isPTTPressedRef.current = false;
      setIsPTTPressed(false);
      toast.error("Microphone access denied — check browser permissions");
      flushPendingChannelSelection();
      return;
    }
  }, [
    activeChannel,
    channelLiveActive,
    signalBusy,
    startRecording,
    stopRecording,
    effectiveChannelId,
    user,
    canSendPtt,
    isRecording,
    releasePttSignal,
    finishPttStop,
    flushPendingChannelSelection,
    ensureFirestoreMembership,
  ]);

  const handlePTTStop = useCallback(() => {
    if (pttStartInFlightRef.current) {
      pttStopPendingRef.current = true;
      isPTTPressedRef.current = false;
      setIsPTTPressed(false);
      return;
    }
    isPTTPressedRef.current = false;
    setIsPTTPressed(false);
    finishPttStop();
  }, [finishPttStop]);

  pttMaxDurationStopRef.current = () => {
    toast.info("Maximum transmission time reached (35 seconds)");
    isPTTPressedRef.current = false;
    setIsPTTPressed(false);
    pttStopPendingRef.current = false;
    void stopLiveTransmit();
    if (pttRecordingActiveRef.current) {
      finishPttStop();
    } else {
      void discardPttRecording(stopRecording, {
        source: "talk",
        channelId: effectiveChannelId,
        user,
        reason: "Maximum transmission time reached before recording was active",
      });
    }
  };

  useRegisterPagePTTHandlers(
    {
      onPress: handlePTTStart,
      onRelease: handlePTTStop,
    },
    { surface: "talk" }
  );

  const handlePlayMessage = (msg) => {
    if (selectionMode) return;
    if (!msg.audio_url) {
      toast.error("Audio unavailable");
      return;
    }
    if (playingId === msg.id) {
      stopAudio();
      if (receivingTimeoutRef.current) { clearTimeout(receivingTimeoutRef.current); receivingTimeoutRef.current = null; }
      setPlayingId(null);
      setIsReceiving(false);
      return;
    }
    setPlayingId(msg.id);
    setIsReceiving(true);
    void transcribeOnReplay(msg);
    if (receivingTimeoutRef.current) clearTimeout(receivingTimeoutRef.current);
    receivingTimeoutRef.current = setTimeout(() => {
      setPlayingId(null);
      setIsReceiving(false);
    }, PTT_MAX_TRANSMISSION_MS);
    let playErrorReported = false;
    const reportPlayError = (err) => {
      if (playErrorReported) return;
      playErrorReported = true;
      if (receivingTimeoutRef.current) {
        clearTimeout(receivingTimeoutRef.current);
        receivingTimeoutRef.current = null;
      }
      setPlayingId(null);
      setIsReceiving(false);
      toast.error(formatAudioPlaybackToast(err));
    };
    playAudioUrl(msg.audio_url, {
      speakerUserId: msg.created_by_id,
      onEnded: () => {
        if (receivingTimeoutRef.current) { clearTimeout(receivingTimeoutRef.current); receivingTimeoutRef.current = null; }
        setPlayingId(null);
        setIsReceiving(false);
      },
      onError: reportPlayError,
    }).catch(reportPlayError);
  };

  if (myChannels.length === 0) {
    const waitingOnApproval =
      user &&
      !isPlatformAdmin(user) &&
      channels.some(
        (ch) =>
          ch.pending_members?.includes(user.id) ||
          ch.pending_members?.includes(user.email)
      );

    return (
      <div className="flex flex-col h-[calc(100vh-56px)] items-center justify-center p-6 text-center">
        <Clock className="w-12 h-12 text-muted-foreground/30 mb-3" />
        <h2 className="text-lg font-bold text-foreground mb-1">
          {channels.length === 0 ? "No channels yet" : "Waiting for approval"}
        </h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          {channels.length === 0
            ? "An administrator needs to set up channels before you can start talking."
            : waitingOnApproval
              ? "An admin needs to approve your channel request before you can start talking."
              : "Request access to a channel from the Channels tab to get started."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ChannelHeader
        channel={activeChannel}
        memberCount={onlineCount}
        onlineMembers={onlineMembers}
        isConnected={!!activeChannel}
      />

      {activeChannel && (
        <ProtectionLevelBadge level={activeChannel.protection_level} />
      )}

      {canDelete && !selectionMode && activeChannel && (
        <div className="flex justify-end px-4 pb-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={handleEnterSelectionMode}
          >
            <CheckSquare className="w-4 h-4" />
            Select messages
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-auto overscroll-contain pb-talk-controls">
        <MessageFeed
          messages={sortedMessages}
          currentUser={user}
          onPlayMessage={handlePlayMessage}
          playingId={playingId}
          canDelete={canDelete}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onEnterSelection={handleEnterSelection}
        />
        <div ref={feedEndRef} />
      </div>

      {selectionMode ? (
        <div className="talk-controls-shell fixed inset-x-0 z-40 bottom-tab-bar-offset flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm font-medium text-foreground">
            {selectedIds.size} selected · tap to toggle · hold to select
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancelSelection}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => deleteMessagesMutation.mutate([...selectedIds])}
              disabled={selectedIds.size === 0 || deleteMessagesMutation.isPending}
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>
          </div>
        </div>
      ) : (
        <div className="talk-controls-shell fixed inset-x-0 z-40 bottom-tab-bar-offset flex flex-col items-center gap-2 px-4 pt-3 pb-2">
          <PTTButton
            isPressed={isPTTPressed}
            onStart={handlePTTStart}
            onStop={handlePTTStop}
            isConnected={!!activeChannel && canSendPtt}
            isReceiving={(isReceiving || channelLiveActive) && !isPTTPressed}
            isChannelBusy={signalBusy && !isPTTPressed && !isReceiving && !channelLiveActive}
          />
          <TextInputBar
            onSend={(text) => sendTextMutation.mutate(text)}
            disabled={!activeChannel || sendTextMutation.isPending || !canSendPtt}
          />
        </div>
      )}
    </div>
  );
}