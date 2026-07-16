import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/api/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PTTButton from "../components/ptt/PTTButton";
import ChannelHeader from "../components/ptt/ChannelHeader";
import MessageFeed from "../components/ptt/MessageFeed";
import ProtectionLevelBadge from "../components/ptt/ProtectionLevelBadge";
import TextInputBar from "../components/ptt/TextInputBar";
import useRelayBroadcast from "../hooks/useRelayBroadcast";
import useRelayReceiver from "../hooks/useRelayReceiver";
import useWiredPTT from "../hooks/useWiredPTT";
import { useBluetoothPTTContext } from "../components/ptt/BluetoothPTTContext";
import { playClearTone, playBusyTone } from "@/lib/pttTones";
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
  const channelBusyTimeoutRef = useRef(null);
  const receivingTimeoutRef = useRef(null);
  const { isRecording, startRecording, stopRecording } = useRelayBroadcast({
    channelId: activeChannelId,
    userId: user?.id,
    userName: user ? getDisplayName(user) : "",
  });
  const { isReceiving: isLiveReceiving, heardBroadcastsRef } = useRelayReceiver({
    channelId: activeChannelId,
    userId: user?.id,
  });

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

  // Subscribe to new messages — auto-play incoming voice messages from other users
  useEffect(() => {
    if (!activeChannelId || !user) return;
    const unsub = api.entities.VoiceMessage.subscribe((event) => {
      if (event.data?.channel_id !== activeChannelId) return;
      queryClient.invalidateQueries({ queryKey: ["messages", activeChannelId] });

      // Auto-play incoming voice messages from other users
      if (event.type === "create" && event.data?.audio_url && event.data?.created_by_id !== user.id) {
        // Skip auto-play if already heard via live relay
        if (event.data?.broadcast_id && heardBroadcastsRef.current.has(event.data.broadcast_id)) return;
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
    });
    return unsub;
  }, [activeChannelId, queryClient, user]);

  // Subscribe to PTT signals — broadcast beeps to all channel members
  useEffect(() => {
    if (!activeChannelId || !user) return;
    const unsub = api.entities.PTTSignal.subscribe((event) => {
      if (event.data?.channel_id !== activeChannelId) return;
      if (event.data?.sender_id === user.id) return; // Ignore my own signals

      if (event.type === "create") {
        playBusyTone();
        setIsChannelBusy(true);
        if (channelBusyTimeoutRef.current) clearTimeout(channelBusyTimeoutRef.current);
        channelBusyTimeoutRef.current = setTimeout(() => {
          setIsChannelBusy(false);
          playClearTone();
        }, 30000);
      } else if (event.type === "delete") {
        if (channelBusyTimeoutRef.current) {
          clearTimeout(channelBusyTimeoutRef.current);
          channelBusyTimeoutRef.current = null;
        }
        setIsChannelBusy(false);
        playClearTone();
      }
    });
    return unsub;
  }, [activeChannelId, user]);

  // Check for existing active signals and clean up stale ones when joining a channel
  useEffect(() => {
    if (!activeChannelId || !user) return;
    setIsChannelBusy(false);
    api.entities.PTTSignal.filter({ channel_id: activeChannelId }, "-created_date", 5)
      .then(signals => {
        const now = Date.now();
        signals.forEach(s => {
          const age = now - new Date(s.created_date).getTime();
          if (age > 15000) {
            api.entities.PTTSignal.delete(s.id).catch(() => {});
          } else if (s.sender_id !== user.id) {
            setIsChannelBusy(true);
          }
        });
      })
      .catch(() => {});
  }, [activeChannelId, user]);

  // Clean up PTT signal on channel change or unmount
  useEffect(() => {
    return () => {
      if (pttSignalRef.current) {
        api.entities.PTTSignal.delete(pttSignalRef.current).catch(() => {});
        pttSignalRef.current = null;
      }
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
        return;
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
      transcribeMessage(msg.id, file_url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", activeChannelId] });
    },
  });

  const sendTextMutation = useMutation({
    mutationFn: async (text) => {
      const now = new Date();
      await api.entities.VoiceMessage.create({
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", activeChannelId] });
    },
  });

  const transcribeMessage = async (msgId, audioUrl) => {
    try {
      const resp = await api.functions.invoke("transcribeAudio", {
        audio_url: audioUrl,
        message_id: msgId,
      });
      queryClient.invalidateQueries({ queryKey: ["messages", activeChannelId] });
    } catch (err) {
      console.error("Transcription failed:", err);
      await api.entities.VoiceMessage.update(msgId, {
        transcript: "[Transcription unavailable]",
        is_transcribed: true,
      });
      queryClient.invalidateQueries({ queryKey: ["messages", activeChannelId] });
    }
  };

  const handlePTTStart = useCallback(async () => {
    if (!activeChannel || isPTTPressed) return;
    if (isReceiving || isLiveReceiving || isChannelBusy) {
      playBusyTone();
      return;
    }
    playClearTone();
    setIsPTTPressed(true);
    const started = await startRecording();
    if (!started) {
      setIsPTTPressed(false);
      toast.error("Microphone access denied");
      return;
    }
    // Broadcast signal so other channel members hear the beeps
    try {
      const signal = await api.entities.PTTSignal.create({
        channel_id: activeChannelId,
        sender_id: user?.id || "",
        sender_name: getDisplayName(user),
      });
      pttSignalRef.current = signal.id;
    } catch (e) {
      // Non-critical — recording still works
    }
  }, [activeChannel, isPTTPressed, isReceiving, isLiveReceiving, isChannelBusy, startRecording, activeChannelId, user]);

  const handlePTTStop = useCallback(() => {
    if (!isPTTPressed) return;
    setIsPTTPressed(false);

    const signalId = pttSignalRef.current;
    pttSignalRef.current = null;
    if (signalId) {
      api.entities.PTTSignal.delete(signalId).catch(() => {});
    }
    playClearTone();

    sendMutation.mutate();
  }, [isPTTPressed, sendMutation]);

  const bluetooth = useBluetoothPTTContext();

  useEffect(() => {
    bluetooth?.registerHandlers(handlePTTStart, handlePTTStop);
    return () => bluetooth?.registerHandlers(null, null);
  }, [handlePTTStart, handlePTTStop, bluetooth]);

  const wired = useWiredPTT({
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
            onStart={handlePTTStart}
            onStop={handlePTTStop}
            isConnected={!!activeChannel}
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