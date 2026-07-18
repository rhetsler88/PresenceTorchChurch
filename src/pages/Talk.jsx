import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/api/client";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import PTTButton from "../components/ptt/PTTButton";
import ChannelHeader from "../components/ptt/ChannelHeader";
import MessageFeed from "../components/ptt/MessageFeed";
import ProtectionLevelBadge from "../components/ptt/ProtectionLevelBadge";
import TextInputBar from "../components/ptt/TextInputBar";
import usePttBroadcast from "../hooks/usePttBroadcast";
import usePttReceiver from "../hooks/usePttReceiver";
import { isAgoraEnabled } from "@/lib/agora";
import useExternalPTT from "../hooks/useExternalPTT";
import { playClearTone, playBusyTone, unlockAudioForPTT } from "@/lib/pttTones";
import { cleanupStalePTTSignals } from "@/lib/pttSignals";
import { playAudioUrl, stopAudio } from "@/lib/audioPlayer";
import { deviceDayKey } from "@/lib/deviceDate";
import { getDisplayName, canAccessChannel, isPlatformAdmin } from "@/lib/userUtils";
import { getCodeDateKey } from "@/lib/dailyCode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Clock, Trash2 } from "lucide-react";

export default function Talk() {
  const [user, setUser] = useState(null);
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
  const channelBusyTimeoutRef = useRef(null);
  const receivingTimeoutRef = useRef(null);
  const {
    isRecording,
    startRecording,
    stopRecording,
    isLiveReceiving: agoraLiveReceiving,
    isChannelReady,
    heardBroadcastsRef,
  } = usePttBroadcast({
    channelId: activeChannelId,
    userId: user?.id,
    userName: user ? getDisplayName(user) : "",
  });

  const { isReceiving: storageLiveReceiving, heardBroadcastsRef: relayHeardRef } = usePttReceiver({
    channelId: activeChannelId,
    userId: user?.id,
  });

  const isLiveReceiving = isAgoraEnabled()
    ? (agoraLiveReceiving || storageLiveReceiving)
    : storageLiveReceiving;

  const urlParams = new URLSearchParams(window.location.search);
  const channelParam = urlParams.get("channel");

  useEffect(() => {
    api.auth.me().then(setUser);
  }, []);

  const { data: channels = [] } = useQuery({
    queryKey: ["channels"],
    queryFn: () => api.entities.Channel.list("-created_date", 50),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.entities.User.list(),
  });

  // Approved members, plus org/platform admins who manage those channels
  const myChannels = channels.filter((channel) => canAccessChannel(user, channel));

  // Auto-select channel from URL param, last selected, or first approved channel
  useEffect(() => {
    if (myChannels.length > 0 && !activeChannelId) {
      const fromUrl = channelParam && myChannels.find(c => c.id === channelParam);
      const fromStorage = localStorage.getItem("lastChannelId");
      const fromLast = fromStorage && myChannels.find(c => c.id === fromStorage);
      const fallback = myChannels[0].id;
      const selected = fromUrl ? fromUrl.id : (fromLast ? fromLast.id : fallback);
      setActiveChannelId(selected);
    }
  }, [myChannels, activeChannelId, channelParam]);

  // Persist channel selection
  useEffect(() => {
    if (activeChannelId) localStorage.setItem("lastChannelId", activeChannelId);
  }, [activeChannelId]);

  const activeChannel = myChannels.find(c => c.id === activeChannelId) || myChannels[0];

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", activeChannelId],
    queryFn: () =>
      activeChannelId
        ? api.entities.VoiceMessage.filter({ channel_id: activeChannelId }, "-created_date", 50)
        : [],
    enabled: !!activeChannelId,
    placeholderData: keepPreviousData,
    refetchInterval: 15000,
  });

  const sortedMessages = [...messages].reverse();

  const canDelete =
    user?.role === "admin" ||
    user?.role === "super_admin" ||
    user?.role === "director";

  const handleLongPress = useCallback((msgId) => {
    if (!canDelete) return;
    setSelectionMode(true);
    setSelectedIds(new Set([msgId]));
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
    mutationFn: async (ids) => {
      await Promise.all(ids.map(id => api.entities.VoiceMessage.delete(id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", activeChannelId] });
      setSelectionMode(false);
      setSelectedIds(new Set());
      toast.success("Messages deleted");
    },
  });

  const mergeChannelMessage = useCallback((message) => {
    if (!message?.id || !activeChannelId) return;
    if (message.channel_id && message.channel_id !== activeChannelId) return;
    queryClient.setQueryData(["messages", activeChannelId], (old = []) => {
      const list = Array.isArray(old) ? old : [];
      const idx = list.findIndex((m) => m.id === message.id);
      if (idx === -1) return [message, ...list];
      const next = [...list];
      next[idx] = { ...next[idx], ...message };
      return next;
    });
  }, [activeChannelId, queryClient]);

  // Subscribe to channel messages — merge creates/updates locally; avoid refetching Talk feed (prevents wipe races)
  useEffect(() => {
    if (!activeChannelId || !user) return;
    const unsub = api.entities.VoiceMessage.subscribe((event) => {
      if (event.data?.channel_id !== activeChannelId) return;

      if (event.type === "create" || event.type === "update") {
        mergeChannelMessage(event.data);
        queryClient.invalidateQueries({ queryKey: ["messages", activeChannelId] });
        queryClient.invalidateQueries({ queryKey: ["all-messages"] });
        queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
      }

      // Auto-play incoming voice messages from other users
      if (event.type === "create" && event.data?.audio_url && event.data?.created_by_id !== user.id) {
        // Skip auto-play if already heard via live relay
        if (event.data?.broadcast_id && (
          heardBroadcastsRef.current.has(event.data.broadcast_id)
          || relayHeardRef.current.has(event.data.broadcast_id)
        )) return;
        setPlayingId(event.data.id);
        setIsReceiving(true);
        if (receivingTimeoutRef.current) clearTimeout(receivingTimeoutRef.current);
        receivingTimeoutRef.current = setTimeout(() => {
          setPlayingId(null);
          setIsReceiving(false);
        }, 30000);
        playAudioUrl(event.data.audio_url, {
          onEnded: () => {
            if (receivingTimeoutRef.current) { clearTimeout(receivingTimeoutRef.current); receivingTimeoutRef.current = null; }
            setPlayingId(null);
            setIsReceiving(false);
          },
          onError: () => {
            if (receivingTimeoutRef.current) { clearTimeout(receivingTimeoutRef.current); receivingTimeoutRef.current = null; }
            setPlayingId(null);
            setIsReceiving(false);
          },
        }).catch(() => {
          if (receivingTimeoutRef.current) { clearTimeout(receivingTimeoutRef.current); receivingTimeoutRef.current = null; }
          setPlayingId(null);
          setIsReceiving(false);
        });
      }
    }, { channel_id: activeChannelId });
    return unsub;
  }, [activeChannelId, queryClient, user, heardBroadcastsRef, relayHeardRef, mergeChannelMessage]);

  // Subscribe to PTT signals — broadcast beeps to all channel members
  useEffect(() => {
    if (!activeChannelId || !user?.id) return;
    const unsub = api.entities.PTTSignal.subscribe((event) => {
      if (event.data?.channel_id !== activeChannelId) return;
      if (event.data?.sender_id === user.id) return;

      if (event.type === "create") {
        playClearTone();
        setIsChannelBusy(true);
        if (channelBusyTimeoutRef.current) clearTimeout(channelBusyTimeoutRef.current);
        channelBusyTimeoutRef.current = setTimeout(() => {
          setIsChannelBusy(false);
        }, 15000);
      } else if (event.type === "delete") {
        if (channelBusyTimeoutRef.current) {
          clearTimeout(channelBusyTimeoutRef.current);
          channelBusyTimeoutRef.current = null;
        }
        setIsChannelBusy(false);
      }
    }, { channel_id: activeChannelId });
    return unsub;
  }, [activeChannelId, user?.id]);

  // Check for existing active signals and clean up stale ones when joining a channel
  useEffect(() => {
    if (!activeChannelId || !user?.id) return;
    setIsChannelBusy(false);
    cleanupStalePTTSignals({ channelId: activeChannelId, excludeSenderId: user.id })
      .then((active) => {
        if (active.length > 0) {
          setIsChannelBusy(true);
          playClearTone();
        }
      })
      .catch(() => {});
  }, [activeChannelId, user?.id]);

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
  }, [activeChannelId]);

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

  const sendMutation = useMutation({
    mutationFn: async () => {
      const result = await stopRecording();

      if (!result) {
        toast.error("Recording failed — message not sent");
        return null;
      }
      const { file_url, duration, broadcast_id } = result;

      const now = new Date();
      const msg = await api.entities.VoiceMessage.create({
        channel_id: activeChannelId,
        sender_name: getDisplayName(user),
        sender_email: user?.email || "",
        audio_url: file_url,
        duration_seconds: Math.round(duration * 10) / 10,
        is_transcribed: false,
        device_time: now.toLocaleTimeString('en-US', {
          hour: 'numeric', minute: '2-digit', hour12: true
        }),
        device_date: deviceDayKey(now),
        broadcast_id,
      });

      // Clean up relay chunks (receivers should have them by now)
      if (broadcast_id) {
        api.entities.AudioChunk.deleteMany({ broadcast_id }).catch(() => {});
      }

      // Transcribe in background
      transcribeMessage(msg.id, file_url, activeChannelId);
      return msg;
    },
    onSuccess: (msg) => {
      if (!msg) return;
      mergeChannelMessage(msg);
      queryClient.invalidateQueries({ queryKey: ["messages", activeChannelId] });
      queryClient.invalidateQueries({ queryKey: ["all-messages"] });
      queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
    },
  });

  const sendTextMutation = useMutation({
    mutationFn: async (text) => {
      const now = new Date();
      return api.entities.VoiceMessage.create({
        channel_id: activeChannelId,
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
      queryClient.invalidateQueries({ queryKey: ["messages", activeChannelId] });
      queryClient.invalidateQueries({ queryKey: ["all-messages"] });
      queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
    },
  });

  const transcribeMessage = async (msgId, audioUrl, channelId) => {
    const messageChannelId = channelId || activeChannelId;
    try {
      const result = await api.functions.invoke("transcribeAudio", {
        audio_url: audioUrl,
        message_id: msgId,
      });
      if (messageChannelId && result?.transcript) {
        mergeChannelMessage({
          id: msgId,
          channel_id: messageChannelId,
          transcript: result.transcript,
          is_transcribed: true,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["all-messages"] });
      queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
    } catch (err) {
      console.error("Transcription failed:", err);
      const fallback = {
        transcript: "[Transcription unavailable]",
        is_transcribed: true,
      };
      await api.entities.VoiceMessage.update(msgId, fallback);
      if (messageChannelId) {
        mergeChannelMessage({ id: msgId, channel_id: messageChannelId, ...fallback });
      }
      queryClient.invalidateQueries({ queryKey: ["all-messages"] });
      queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
    }
  };

  const finishPttStop = useCallback(() => {
    const signalId = pttSignalRef.current;
    pttSignalRef.current = null;
    if (signalId) {
      api.entities.PTTSignal.delete(signalId).catch(() => {});
    }

    if (pttRecordingActiveRef.current) {
      pttRecordingActiveRef.current = false;
      sendMutation.mutate();
    }
  }, [sendMutation]);

  const handlePTTStart = useCallback(async () => {
    if (!activeChannel || isPTTPressed || !user?.id) return;
    if (isReceiving || isLiveReceiving || isChannelBusy) {
      playBusyTone();
      return;
    }

    unlockAudioForPTT();
    playClearTone();

    setIsPTTPressed(true);
    pttStopPendingRef.current = false;
    pttRecordingActiveRef.current = false;

    let signalId = null;
    try {
      const signal = await api.entities.PTTSignal.create({
        channel_id: activeChannelId,
        sender_id: user.id,
        sender_name: getDisplayName(user),
      });
      signalId = signal.id;
      pttSignalRef.current = signalId;
    } catch (e) {
      console.error("PTT signal create failed:", e);
      setIsPTTPressed(false);
      toast.error("Could not claim channel — try again");
      return;
    }

    const startPromise = startRecording();
    pttStartInFlightRef.current = startPromise;
    const started = await startPromise;
    pttStartInFlightRef.current = null;

    if (pttStopPendingRef.current) {
      pttStopPendingRef.current = false;
      setIsPTTPressed(false);
      if (started) await stopRecording();
      if (signalId) {
        api.entities.PTTSignal.delete(signalId).catch(() => {});
        pttSignalRef.current = null;
      }
      return;
    }

    if (!started) {
      setIsPTTPressed(false);
      if (signalId) {
        api.entities.PTTSignal.delete(signalId).catch(() => {});
        pttSignalRef.current = null;
      }
      toast.error(
        isAgoraEnabled()
          ? "Could not start live voice — wait for connect or check mic permission"
          : "Microphone access denied"
      );
      return;
    }

    pttRecordingActiveRef.current = true;
    playClearTone();
  }, [
    activeChannel,
    isPTTPressed,
    isReceiving,
    isLiveReceiving,
    isChannelBusy,
    startRecording,
    stopRecording,
    activeChannelId,
    user,
  ]);

  const handlePTTStop = useCallback(() => {
    if (pttStartInFlightRef.current) {
      pttStopPendingRef.current = true;
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
              u.role === "admin" || u.role === "super_admin" || u.role === "director";
            return bypassesCode || u.daily_code_verified_date === getCodeDateKey();
          }).length
        }
        isConnected={!!activeChannel}
      />

      {activeChannel && (
        <ProtectionLevelBadge level={activeChannel.protection_level} />
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
          onLongPress={handleLongPress}
        />
        <div ref={feedEndRef} />
      </div>

      {selectionMode ? (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-card border-t border-border">
          <span className="text-sm font-medium text-foreground">
            {selectedIds.size} selected
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
            isRecording={isRecording}
            onStart={handlePTTStart}
            onStop={handlePTTStop}
            isConnected={!!activeChannel && (!isAgoraEnabled() || isChannelReady || isPTTPressed || isRecording)}
            isReceiving={(isReceiving || isLiveReceiving) && !isRecording}
            isChannelBusy={isChannelBusy && !isRecording && !isReceiving && !isLiveReceiving}
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