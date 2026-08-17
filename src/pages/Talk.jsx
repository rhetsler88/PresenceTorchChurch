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
import {
  usePassiveTalkListen,
  usePassiveTalkListenRegistration,
} from "../components/ptt/PassiveTalkListenProvider";
import useExternalPTT from "../hooks/useExternalPTT";
import { playClearTone, playBusyTone, unlockAudioForPTT, playTextMessageTone } from "@/lib/pttTones";
import { isProtectionLevelChangeMessage } from "@/lib/protectionLevelHistory";
import { cleanupStalePTTSignals, claimPttChannels, releasePttSignals } from "@/lib/pttSignals";
import { playAudioUrl, stopAudio } from "@/lib/audioPlayer";
import { deviceDayKey } from "@/lib/deviceDate";
import {
  getDisplayName,
  canAccessChannel,
  isPlatformAdmin,
  canReadVoiceMessageForChannel,
  canAccessChannelAlertsForChannel,
  canSendOnChannelForChannel,
  bypassesDailyCode,
  canAccessMonitorPage,
} from "@/lib/userUtils";
import { getCodeDateKey, isDailyCodeVerified } from "@/lib/dailyCode";
import { useAuth } from "@/lib/AuthContext";
import {
  ensureUserChannelMembership,
  userHasFirestoreChannelAccess,
} from "@/lib/channelMembership";
import { auth } from "@/lib/firebase";
import { toast } from "@/lib/toast";
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
  const [isChannelBusy, setIsChannelBusy] = useState(false);
  const [isPTTPressed, setIsPTTPressed] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const queryClient = useQueryClient();
  const feedEndRef = useRef(null);
  const pttSignalRef = useRef(null);
  const pttRecordingActiveRef = useRef(false);
  const pttStartInFlightRef = useRef(null);
  const pttStopPendingRef = useRef(false);
  const pttSessionChannelIdRef = useRef(null);
  const pttSessionUserRef = useRef(null);
  const channelBusyTimeoutRef = useRef(null);
  const receivingTimeoutRef = useRef(null);
  /** Active monitor/PTT broadcast on this channel (from PTT signal, not yet heard). */
  const activeLiveBroadcastRef = useRef(null);
  const activeBroadcastClearTimerRef = useRef(null);

  const [searchParams] = useSearchParams();
  const channelParam = searchParams.get("channel");

  const { data: channels = [] } = useQuery({
    queryKey: ["channels"],
    queryFn: () => api.entities.Channel.list("-created_date", 50),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.entities.User.list(),
  });

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
  const canAccessAlerts = Boolean(
    activeChannel && user && canAccessChannelAlertsForChannel(user, activeChannel)
  );
  const canSendPtt = Boolean(
    activeChannel
    && user
    && canSendOnChannelForChannel(user, activeChannel)
    && (bypassesDailyCode(user) || isDailyCodeVerified(user))
  );
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

  usePassiveTalkListenRegistration({
    channelId: effectiveChannelId,
    title: activeChannel?.name || "Talk",
    canRead: !hasPassiveMonitor && canReadMessages,
    listenPaused: isPTTPressed,
    persist: true,
  });

  const {
    startRecording,
    stopRecording,
    stopLiveTransmit,
  } = usePttBroadcast({
    channelId: effectiveChannelId,
    userId: user?.id,
    userName: user ? getDisplayName(user) : "",
    listenActive: false,
    receiveEnabled: false,
  });

  const channelLiveActive = hasPassiveMonitor
    ? isChannelBusy
    : Boolean(
        passiveTalk?.isLiveReceiving
        && passiveTalk?.listenChannelId === effectiveChannelId
      );

  // Reset live-broadcast tracking when switching channels
  useEffect(() => {
    activeLiveBroadcastRef.current = null;
    if (activeBroadcastClearTimerRef.current) {
      clearTimeout(activeBroadcastClearTimerRef.current);
      activeBroadcastClearTimerRef.current = null;
    }
  }, [effectiveChannelId]);

  // Auto-select channel from URL param, last selected, or first approved channel
  useEffect(() => {
    if (myChannels.length === 0) return;

    const fromUrl = channelParam && myChannels.find((c) => c.id === channelParam);
    if (fromUrl) {
      if (activeChannelId !== fromUrl.id) {
        setActiveChannelId(fromUrl.id);
      }
      return;
    }

    if (!activeChannelId) {
      const fromStorage = localStorage.getItem("lastChannelId");
      const fromLast = fromStorage && myChannels.find((c) => c.id === fromStorage);
      const fallback = myChannels[0].id;
      setActiveChannelId(fromLast ? fromLast.id : fallback);
    }
  }, [myChannels, activeChannelId, channelParam]);

  // Drop stale selection when membership or admin scope changes
  useEffect(() => {
    if (!user) return;
    if (activeChannelId && !myChannels.some((c) => c.id === activeChannelId)) {
      setActiveChannelId(myChannels[0]?.id ?? null);
    }
  }, [user, myChannels, activeChannelId]);

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
        toast.error("Permission denied — confirm your account role is admin or director.");
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

        // Ding for incoming text messages from other users
        if (
          event.type === "create"
          && event.data?.text_content
          && !event.data?.audio_url
          && event.data?.created_by_id !== user.id
          && !isProtectionLevelChangeMessage(event.data)
        ) {
          playTextMessageTone();
        }
      },
      { channel_id: effectiveChannelId }
    );
    return unsub;
  }, [effectiveChannelId, canReadMessages, canQueryFirestore, queryClient, user, mergeChannelMessage]);

  // Subscribe to PTT signals — broadcast beeps to all channel members
  useEffect(() => {
    if (!effectiveChannelId || !user?.id || !canAccessAlerts || !canQueryFirestore) return;
    const unsub = api.entities.PTTSignal.subscribe((event) => {
      if (event.data?.channel_id !== effectiveChannelId) return;
      if (event.data?.sender_id === user.id) return;

      if (event.type === "create") {
        if (event.data?.broadcast_id) {
          activeLiveBroadcastRef.current = event.data.broadcast_id;
          if (activeBroadcastClearTimerRef.current) {
            clearTimeout(activeBroadcastClearTimerRef.current);
            activeBroadcastClearTimerRef.current = null;
          }
        }
        playClearTone();
        setIsChannelBusy(true);
        if (channelBusyTimeoutRef.current) clearTimeout(channelBusyTimeoutRef.current);
        channelBusyTimeoutRef.current = setTimeout(() => {
          setIsChannelBusy(false);
        }, 15000);
      } else if (event.type === "delete") {
        if (event.data?.broadcast_id) {
          const deletedId = event.data.broadcast_id;
          if (activeBroadcastClearTimerRef.current) {
            clearTimeout(activeBroadcastClearTimerRef.current);
          }
          activeBroadcastClearTimerRef.current = setTimeout(() => {
            if (activeLiveBroadcastRef.current === deletedId) {
              activeLiveBroadcastRef.current = null;
            }
            activeBroadcastClearTimerRef.current = null;
          }, 20000);
        }
        if (channelBusyTimeoutRef.current) {
          clearTimeout(channelBusyTimeoutRef.current);
          channelBusyTimeoutRef.current = null;
        }
        setIsChannelBusy(false);
      }
    }, { channel_id: effectiveChannelId });
    return unsub;
  }, [effectiveChannelId, user?.id, canAccessAlerts, canQueryFirestore]);

  // Check for existing active signals and clean up stale ones when joining a channel
  useEffect(() => {
    if (!effectiveChannelId || !user?.id || !canAccessAlerts || !canQueryFirestore) return;
    setIsChannelBusy(false);
    cleanupStalePTTSignals({ channelId: effectiveChannelId, excludeSenderId: user.id })
      .then((active) => {
        if (active.length > 0) {
          const activeSignal = active.find((signal) => signal.broadcast_id);
          if (activeSignal?.broadcast_id) {
            activeLiveBroadcastRef.current = activeSignal.broadcast_id;
          }
          setIsChannelBusy(true);
          playClearTone();
        }
      })
      .catch(() => {});
  }, [effectiveChannelId, user?.id, canAccessAlerts, canQueryFirestore]);

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
      if (channelBusyTimeoutRef.current) {
        clearTimeout(channelBusyTimeoutRef.current);
        channelBusyTimeoutRef.current = null;
      }
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

  const ensureFirestoreMembership = useCallback(async () => {
    if (!user?.id || !activeChannel || !effectiveChannelId) return;
    await refreshChannelMembership();
    const added = await ensureUserChannelMembership(
      user.id,
      user.email,
      activeChannel
    );
    if (added) await refreshChannelMembership();
    await auth.currentUser?.getIdToken(true);
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

      await ensureFirestoreMembership();

      const result = await stopRecording();

      if (!result) {
        throw Object.assign(new Error("Recording produced no audio or upload failed"), {
          code: "app/recording-failed",
        });
      }
      const { file_url, duration, broadcast_id } = result;

      const now = new Date();
      const msg = await api.entities.VoiceMessage.create({
        channel_id: channelId,
        sender_id: resolvedUser.id,
        sender_name: getDisplayName(resolvedUser),
        sender_email: resolvedUser.email || "",
        audio_url: file_url,
        duration_seconds: Math.round(duration * 10) / 10,
        is_transcribed: false,
        device_time: now.toLocaleTimeString('en-US', {
          hour: 'numeric', minute: '2-digit', hour12: true
        }),
        device_date: deviceDayKey(now),
        broadcast_id,
      });

      // Clean up relay chunks (best-effort; only admins can delete in rules)
      if (broadcast_id) {
        api.entities.AudioChunk.deleteMany({ broadcast_id }).catch(() => {});
      }

      transcribeMessage(msg.id, file_url, channelId);
      return msg;
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
    },
    onError: (err) => {
      console.error("Voice message send failed:", err, {
        channelId: pttSessionChannelIdRef.current || effectiveChannelId,
        userId: user?.id,
        code: err?.code,
      });
      if (err?.code === "auth/not-authenticated") {
        toast.error("Session expired — please sign in again");
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

  const sendTextMutation = useMutation({
    mutationFn: async (text) => {
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
      mergeChannelMessage(msg);
      queryClient.invalidateQueries({ queryKey: messagesQueryKey });
      queryClient.invalidateQueries({ queryKey: ["all-messages"] });
      queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
    },
    onError: (err) => {
      console.error("Text message send failed:", err);
      toast.error(err?.code === "permission-denied" || err?.message?.includes("permission")
        ? `Permission denied — ${describePermissionFailure(user)}`
        : "Could not send text message");
    },
  });

  const transcribeMessage = async (msgId, audioUrl, channelId) => {
    const messageChannelId = channelId || effectiveChannelId;
    try {
      /** @type {any} */
      const result = await api.functions.invoke("transcribeAudio", {
        audio_url: audioUrl,
        message_id: msgId,
      });
      const transcript = result?.transcript;
      if (messageChannelId && transcript) {
        mergeChannelMessage({
          id: msgId,
          channel_id: messageChannelId,
          transcript,
          is_transcribed: true,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["all-messages"] });
      queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
    } catch {
      // transcribeOnVoiceMessage Firestore trigger updates the doc; subscribe will merge it.
    }
  };

  const finishPttStop = useCallback(() => {
    const signalId = pttSignalRef.current;
    pttSignalRef.current = null;
    if (signalId) {
      api.entities.PTTSignal.delete(signalId).catch(() => {});
    }

    void stopLiveTransmit();

    if (pttRecordingActiveRef.current) {
      pttRecordingActiveRef.current = false;
      sendMutation.mutate({
        channelId: pttSessionChannelIdRef.current || effectiveChannelId,
        sessionUser: pttSessionUserRef.current || user,
      });
      return;
    }

    pttSessionChannelIdRef.current = null;
    pttSessionUserRef.current = null;
  }, [sendMutation, effectiveChannelId, user, stopLiveTransmit]);

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
      || isPTTPressed
      || pttRecordingActiveRef.current
    ) {
      return;
    }
    if (channelLiveActive || isChannelBusy) {
      playBusyTone();
      return;
    }

    unlockAudioForPTT();
    playClearTone();

    pttSessionChannelIdRef.current = effectiveChannelId;
    pttSessionUserRef.current = user;
    setIsPTTPressed(true);
    pttStopPendingRef.current = false;
    pttRecordingActiveRef.current = false;

    const startSequence = (async () => {
      let signalId = null;
      const broadcastId = crypto.randomUUID();
      try {
        try {
          await ensureFirestoreMembership();
        } catch (syncErr) {
          console.warn("PTT access sync failed:", syncErr);
        }

        const started = await startRecording({ broadcastId });

        if (pttStopPendingRef.current) {
          if (started) {
            pttRecordingActiveRef.current = true;
            return { pendingSend: true, signalId: null };
          }
          return { aborted: true };
        }

        if (!started) {
          return { micDenied: true };
        }

        pttRecordingActiveRef.current = true;
        activeLiveBroadcastRef.current = broadcastId;

        void cleanupStalePTTSignals({
          channelId: effectiveChannelId,
          excludeSenderId: user.id,
        }).catch(() => {});

        claimPttChannels({
          channelIds: [effectiveChannelId],
          senderId: user.id,
          senderName: getDisplayName(user),
          broadcastId,
          primaryChannelId: effectiveChannelId,
        }).then(({ signalIds }) => {
          pttSignalRef.current = signalIds[0] ?? null;
        }).catch((err) => {
          console.warn("PTT signal create failed:", err);
        });

        if (pttStopPendingRef.current) {
          return { pendingSend: true, signalId: null };
        }

        playClearTone();
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
      setIsPTTPressed(false);
      finishPttStop();
      return;
    }

    if (result.aborted || cancelled) {
      setIsPTTPressed(false);
      return;
    }

    if (result.startFailed) {
      console.error("PTT start failed:", result.error);
      await stopRecording().catch(() => {});
      setIsPTTPressed(false);
      toast.error("Could not start transmission");
      return;
    }

    if (result.claimFailed) {
      console.error("PTT signal create failed:", result.error);
      await releasePttSignals(result.signalId ? [result.signalId] : []);
      releasePttSignal(result.signalId);
      await stopRecording().catch(() => {});
      setIsPTTPressed(false);
      if (!cancelled) {
        toast.error("Could not claim channel — try again");
      }
      return;
    }

    if (result.micDenied) {
      await stopRecording().catch(() => {});
      setIsPTTPressed(false);
      toast.error("Microphone access denied — check browser permissions");
      return;
    }
  }, [
    activeChannel,
    isPTTPressed,
    channelLiveActive,
    isChannelBusy,
    startRecording,
    stopRecording,
    effectiveChannelId,
    user,
    canSendPtt,
    releasePttSignal,
    finishPttStop,
    ensureFirestoreMembership,
  ]);

  const handlePTTStop = useCallback(() => {
    if (pttStartInFlightRef.current) {
      pttStopPendingRef.current = true;
      setIsPTTPressed(false);
      return;
    }
    if (!isPTTPressed && !pttRecordingActiveRef.current) return;
    setIsPTTPressed(false);
    finishPttStop();
  }, [isPTTPressed, finishPttStop]);

  useExternalPTT({
    onPress: handlePTTStart,
    onRelease: handlePTTStop,
  });

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
    if (receivingTimeoutRef.current) clearTimeout(receivingTimeoutRef.current);
    receivingTimeoutRef.current = setTimeout(() => {
      setPlayingId(null);
      setIsReceiving(false);
    }, 30000);
    playAudioUrl(msg.audio_url, {
      onEnded: () => {
        if (receivingTimeoutRef.current) { clearTimeout(receivingTimeoutRef.current); receivingTimeoutRef.current = null; }
        setPlayingId(null);
        setIsReceiving(false);
      },
      onError: () => {
        if (receivingTimeoutRef.current) { clearTimeout(receivingTimeoutRef.current); receivingTimeoutRef.current = null; }
        setPlayingId(null);
        setIsReceiving(false);
        toast.error("Could not play audio");
      },
    }).catch(() => {
      if (receivingTimeoutRef.current) { clearTimeout(receivingTimeoutRef.current); receivingTimeoutRef.current = null; }
      setPlayingId(null);
      setIsReceiving(false);
      toast.error("Could not play audio");
    });
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
        memberCount={
          allUsers.filter((u) => {
            const isMember =
              activeChannel?.members?.includes(u.id) ||
              activeChannel?.members?.includes(u.email);
            if (!isMember) return false;
            const bypassesCode =
              u.role === "admin" || u.role === "super_admin" || u.role === "lead" || u.role === "director";
            return bypassesCode || u.daily_code_verified_date === getCodeDateKey();
          }).length
        }
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

      <div className="flex-1 overflow-auto overscroll-contain">
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
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-card border-t border-border">
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
        <div className="pb-safe pt-3 flex flex-col items-center gap-3 bg-gradient-to-t from-background via-background to-transparent">
          <PTTButton
            isPressed={isPTTPressed}
            onStart={handlePTTStart}
            onStop={handlePTTStop}
            isConnected={!!activeChannel && canSendPtt}
            isReceiving={(isReceiving || channelLiveActive) && !isPTTPressed}
            isChannelBusy={isChannelBusy && !isPTTPressed && !isReceiving && !channelLiveActive}
          />
          <TextInputBar
            onSend={(text) => sendTextMutation.mutate(text)}
            disabled={!activeChannel || sendTextMutation.isPending}
          />
        </div>
      )}
    </div>
  );
}