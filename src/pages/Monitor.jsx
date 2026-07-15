import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "@/api/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Radio, Volume2, VolumeX, Activity, Eye, Play, Pause, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { etzTime } from "@/lib/etz";
import { deviceDayKey, deviceDayLabel } from "@/lib/deviceDate";
import { getDisplayName } from "@/lib/userUtils";
import { playClearTone, playBusyTone } from "@/lib/pttTones";
import { resolveAudioUrl } from "@/lib/secureAudio";
import useRelayBroadcast from "../hooks/useRelayBroadcast";
import useMonitorRelayReceiver from "../hooks/useMonitorRelayReceiver";
import MonitorPTTBar from "../components/monitor/MonitorPTTBar";
import ProtectionLevelControl from "../components/monitor/ProtectionLevelControl";
import SetAllProtectionLevel from "../components/monitor/SetAllProtectionLevel";
import { toast } from "sonner";

function ChannelMonitorCard({ channel, messages, isAutoPlay, onPlayMessage, playingId, onSetProtectionLevel, userMap }) {
  const lastMsg = messages[0];
  const hasActivity = messages.length > 0;

  return (
    <div className={`bg-card border rounded-2xl overflow-hidden transition-all duration-300 ${
      playingId && messages.some(m => m.id === playingId)
        ? "border-green-500/50 shadow-lg shadow-green-500/10"
        : "border-border"
    }`}>
      {/* Channel header */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-border">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: (channel.color || "#f59e0b") + "20" }}
        >
          <Radio className="w-4 h-4" style={{ color: channel.color || "#f59e0b" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{channel.name}</p>
          <p className="text-[10px] text-muted-foreground">{messages.length} messages</p>
        </div>
        {playingId && messages.some(m => m.id === playingId) && (
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            className="flex items-center gap-1 text-green-500"
          >
            <Volume2 className="w-4 h-4" />
            <span className="text-[10px] font-semibold">LIVE</span>
          </motion.div>
        )}
      </div>

      {/* Protection level control */}
      <div className="px-4 py-2 border-b border-border">
        <ProtectionLevelControl
          level={channel.protection_level}
          onChange={(lvl) => onSetProtectionLevel(channel.id, lvl)}
        />
      </div>

      {/* Message list */}
      <div className="divide-y divide-border max-h-48 overflow-y-auto">
        {messages.slice(0, 5).map(msg => (
          <div
            key={msg.id}
            className="px-4 py-2.5 flex items-start gap-2 hover:bg-muted/30 transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-[9px] font-bold text-primary">
                {(msg.sender_name || "?").slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-xs font-semibold text-foreground">
                  {userMap?.[msg.created_by_id] ? getDisplayName(userMap[msg.created_by_id]) : (msg.sender_name || "Unknown")}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {msg.device_time || etzTime(msg.created_date)}
                </span>
                {(() => {
                  const dk = msg.device_date || deviceDayKey(msg.created_date);
                  if (dk === deviceDayKey()) return null;
                  return (
                    <span className="text-[9px] text-muted-foreground/60 font-semibold uppercase tracking-wide">
                      {deviceDayLabel(dk)}
                    </span>
                  );
                })()}
              </div>
              {msg.transcript ? (
                <p className="text-xs text-muted-foreground truncate">{msg.transcript}</p>
              ) : (
                <p className="text-xs text-muted-foreground/50 italic">Voice message</p>
              )}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="w-6 h-6 flex-shrink-0"
              onClick={() => onPlayMessage(msg)}
            >
              {playingId === msg.id
                ? <Pause className="w-3 h-3 text-green-500" />
                : <Play className="w-3 h-3" />
              }
            </Button>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-muted-foreground">No activity yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Monitor() {
  const [autoPlay, setAutoPlay] = useState(true);
  const [playingId, setPlayingId] = useState(null);
  const [playingChannel, setPlayingChannel] = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  const [user, setUser] = useState(null);
  const [channelOrder, setChannelOrder] = useState([]);

  // PTT state (lifted from MonitorPTTBar)
  const [targetChannelId, setTargetChannelId] = useState(null);
  const [broadcastAll, setBroadcastAll] = useState(false);
  const [isPTTPressed, setIsPTTPressed] = useState(false);
  const [isChannelBusy, setIsChannelBusy] = useState(false);

  const audioRef = useRef(null);
  const autoPlayQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const pttSignalRefs = useRef([]);
  const channelBusyTimeoutRef = useRef(null);
  const broadcastAllRef = useRef(broadcastAll);
  broadcastAllRef.current = broadcastAll;
  const targetChannelIdRef = useRef(targetChannelId);
  targetChannelIdRef.current = targetChannelId;
  const queryClient = useQueryClient();

  // Persist channel order to localStorage
  useEffect(() => {
    const saved = localStorage.getItem("monitorChannelOrder");
    if (saved) setChannelOrder(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem("monitorChannelOrder", JSON.stringify(channelOrder));
  }, [channelOrder]);

  useEffect(() => { api.auth.me().then(setUser); }, []);

  const { data: channels = [] } = useQuery({
    queryKey: ["channels"],
    queryFn: () => api.entities.Channel.list("-created_date", 50),
  });

  const { data: allMessages = [] } = useQuery({
    queryKey: ["all-channel-messages"],
    queryFn: () => api.entities.VoiceMessage.list("-created_date", 200),
    refetchInterval: 5000,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.entities.User.list(),
  });

  // Initialize target channel from localStorage or first channel
  useEffect(() => {
    if (channels.length > 0 && !targetChannelId) {
      const lastId = localStorage.getItem("lastChannelId");
      if (lastId && channels.find(c => c.id === lastId)) {
        setTargetChannelId(lastId);
      } else {
        setTargetChannelId(channels[0].id);
      }
    }
  }, [channels, targetChannelId]);

  const handleTargetChannelChange = useCallback((id) => {
    setTargetChannelId(id);
    localStorage.setItem("lastChannelId", id);
  }, []);

  // Half-duplex relay broadcast for the target channel
  const { isRecording, startRecording, stopRecording } = useRelayBroadcast({
    channelId: targetChannelId,
    userId: user?.id,
    userName: user ? getDisplayName(user) : "",
  });

  // Live relay receiver — listens to ALL channels
  const { isReceiving: isLiveReceiving, heardBroadcastsRef } = useMonitorRelayReceiver({
    userId: user?.id,
    channelIds: channels.map(c => c.id),
  });

  // Subscribe to PTT signals across all channels — busy tones + channel busy state
  useEffect(() => {
    if (!user) return;
    const unsub = api.entities.PTTSignal.subscribe((event) => {
      if (!channels.find(c => c.id === event.data?.channel_id)) return;
      if (event.data?.sender_id === user.id) return;

      if (event.type === "create") {
        playClearTone();
        setIsChannelBusy(true);
        if (channelBusyTimeoutRef.current) clearTimeout(channelBusyTimeoutRef.current);
        channelBusyTimeoutRef.current = setTimeout(() => setIsChannelBusy(false), 15000);
      } else if (event.type === "delete") {
        if (channelBusyTimeoutRef.current) {
          clearTimeout(channelBusyTimeoutRef.current);
          channelBusyTimeoutRef.current = null;
        }
        setIsChannelBusy(false);
      }
    });
    return unsub;
  }, [channels, user]);

  // Clean up stale PTT signals on mount
  useEffect(() => {
    if (!user) return;
    api.entities.PTTSignal.list("-created_date", 20)
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
  }, [user]);

  // Clean up PTT signals on unmount
  useEffect(() => {
    return () => {
      pttSignalRefs.current.forEach(id => {
        api.entities.PTTSignal.delete(id).catch(() => {});
      });
      pttSignalRefs.current = [];
      if (channelBusyTimeoutRef.current) {
        clearTimeout(channelBusyTimeoutRef.current);
      }
    };
  }, []);

  // Ordered channels: saved order first, then any new channels appended
  const orderedChannels = useMemo(() => {
    const orderMap = {};
    channelOrder.forEach((id, idx) => { orderMap[id] = idx; });
    return [...channels].sort((a, b) => {
      const ai = orderMap[a.id] ?? 9999;
      const bi = orderMap[b.id] ?? 9999;
      if (ai === bi) return 0;
      return ai - bi;
    });
  }, [channels, channelOrder]);

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = [...orderedChannels];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setChannelOrder(reordered.map(c => c.id));
  };

  const userMap = {};
  users.forEach(u => { userMap[u.id] = u; });

  // Group messages by channel
  const messagesByChannel = {};
  channels.forEach(c => { messagesByChannel[c.id] = []; });
  allMessages.forEach(m => {
    if (messagesByChannel[m.channel_id]) {
      messagesByChannel[m.channel_id].push(m);
    }
  });

  // Auto-play queue processor
  const processQueue = () => {
    if (isPlayingRef.current || autoPlayQueueRef.current.length === 0) return;
    const next = autoPlayQueueRef.current.shift();
    isPlayingRef.current = true;
    setPlayingId(next.id);
    setPlayingChannel(next.channel_id);

    const audio = new Audio(next.audio_url);
    audioRef.current = audio;
    audio.play().catch(() => {});
    audio.onended = () => {
      setPlayingId(null);
      setPlayingChannel(null);
      isPlayingRef.current = false;
      setTimeout(processQueue, 300);
    };
    audio.onerror = () => {
      setPlayingId(null);
      setPlayingChannel(null);
      isPlayingRef.current = false;
      setTimeout(processQueue, 300);
    };
  };

  // Real-time subscription across ALL channels
  useEffect(() => {
    const unsub = api.entities.VoiceMessage.subscribe((event) => {
      if (event.type !== "create") return;

      // Skip auto-play if already heard via live relay
      if (event.data?.broadcast_id && heardBroadcastsRef.current.has(event.data.broadcast_id)) {
        queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
        return;
      }

      if (event.data?.audio_url && event.data.created_by_id !== user?.id) {
        const channel = channels.find(c => c.id === event.data.channel_id);
        // Log activity
        setActivityLog(prev => [{
          ...event.data,
          channelName: channel?.name || "Unknown",
          channelColor: channel?.color || "#f59e0b",
          ts: new Date(),
        }, ...prev].slice(0, 20));

        // Queue for auto-play
        if (autoPlay) {
          autoPlayQueueRef.current.push(event.data);
          processQueue();
        }
      }
      queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
    });
    return unsub;
  }, [channels, autoPlay, user, queryClient]);

  const handlePlayMessage = async (msg) => {
    if (playingId === msg.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      setPlayingChannel(null);
      isPlayingRef.current = false;
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      isPlayingRef.current = false;
    }
    isPlayingRef.current = true;
    setPlayingId(msg.id);
    setPlayingChannel(msg.channel_id);
    const url = await resolveAudioUrl(msg.audio_url);
    if (!url) {
      setPlayingId(null);
      setPlayingChannel(null);
      isPlayingRef.current = false;
      return;
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play().catch(() => {});
    audio.onended = () => {
      setPlayingId(null);
      setPlayingChannel(null);
      isPlayingRef.current = false;
    };
  };

  // Set protection level (synced to Talk page in real-time)
  const handleSetProtectionLevel = async (channelId, level) => {
    await api.entities.Channel.update(channelId, { protection_level: level });
    queryClient.invalidateQueries({ queryKey: ["channels"] });
    toast.success(`Protection level set to ${level}`);
  };

  // Set protection level across all channels at once
  const handleSetAllProtectionLevel = async (level) => {
    await Promise.all(channels.map(c =>
      api.entities.Channel.update(c.id, { protection_level: level })
    ));
    queryClient.invalidateQueries({ queryKey: ["channels"] });
    toast.success(`All channels set to ${level}`);
  };

  // PTT send — uses relay broadcast result (already uploaded)
  const sendMutation = useMutation({
    mutationFn: async () => {
      const result = await stopRecording();

      // Always clean up PTT signals so others know we're done
      await Promise.all(
        pttSignalRefs.current.map(id =>
          api.entities.PTTSignal.delete(id).catch(() => {})
        )
      );
      pttSignalRefs.current = [];

      if (!result) return null;
      const { file_url, duration, broadcast_id } = result;

      const now = new Date();
      const deviceTime = now.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true
      });
      const deviceDate = deviceDayKey(now);
      const isBroadcastAll = broadcastAllRef.current;
      const targetId = targetChannelIdRef.current;

      const targetIds = isBroadcastAll
        ? channels.map(c => c.id)
        : [targetId].filter(Boolean);

      const created = await Promise.all(targetIds.map(cid =>
        api.entities.VoiceMessage.create({
          channel_id: cid,
          sender_name: getDisplayName(user) || "Monitor",
          sender_email: user?.email || "",
          audio_url: file_url,
          duration_seconds: Math.round(duration * 10) / 10,
          is_transcribed: false,
          device_time: deviceTime,
          device_date: deviceDate,
          broadcast_id: cid === targetId ? broadcast_id : undefined,
        })
      ));

      // Clean up relay chunks for the target channel
      if (broadcast_id) {
        api.entities.AudioChunk.deleteMany({ broadcast_id }).catch(() => {});
      }

      queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });

      // Transcribe each message in the background
      created.forEach(msg => {
        api.functions.invoke("transcribeAudio", {
          audio_url: file_url,
          message_id: msg.id,
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
        }).catch(() => {});
      });

      return isBroadcastAll
        ? `all ${targetIds.length} channels`
        : channels.find(c => c.id === targetId)?.name || "channel";
    },
    onSuccess: (label) => {
      if (label) toast.success(`Sent to ${label}`);
    },
  });

  const handlePTTStart = useCallback(async () => {
    if (isPTTPressed) return;
    if (isLiveReceiving || isChannelBusy || isPlayingRef.current) {
      playBusyTone();
      return;
    }
    playClearTone();
    setIsPTTPressed(true);
    startRecording();

    // Create PTT signals so channel members hear the beeps
    const targetIds = broadcastAllRef.current
      ? channels.map(c => c.id)
      : [targetChannelIdRef.current].filter(Boolean);
    try {
      const signals = await Promise.all(targetIds.map(cid =>
        api.entities.PTTSignal.create({
          channel_id: cid,
          sender_id: user?.id || "",
          sender_name: getDisplayName(user),
        })
      ));
      pttSignalRefs.current = signals.map(s => s.id);
    } catch (e) {
      // Non-critical — recording still works
    }
  }, [isPTTPressed, isLiveReceiving, isChannelBusy, startRecording, channels, user]);

  const handlePTTStop = useCallback(() => {
    if (!isPTTPressed) return;
    setIsPTTPressed(false);
    sendMutation.mutate();
  }, [isPTTPressed, sendMutation]);

  const totalMessages = allMessages.length;
  const activeChannelCount = Object.values(messagesByChannel).filter(msgs => msgs.length > 0).length;
  const showReceiving = (isLiveReceiving || !!playingId || isChannelBusy) && !isPTTPressed;

  return (
    <div className="min-h-screen safe-top">
      {/* Header */}
      <div className="px-4 pt-4 pb-4 border-b border-border sm:px-5 sm:pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-bold text-foreground sm:text-xl">Channel Monitor</h1>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Listening across all channels</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <SetAllProtectionLevel onApply={handleSetAllProtectionLevel} />
            <div className="flex items-center gap-2 bg-muted/50 rounded-xl px-3 py-2">
              <Switch
                id="autoplay"
                aria-label="Toggle auto-play of incoming voice messages"
                checked={autoPlay}
                onCheckedChange={(v) => {
                  setAutoPlay(v);
                  if (!v) {
                    audioRef.current?.pause();
                    setPlayingId(null);
                    setPlayingChannel(null);
                    isPlayingRef.current = false;
                    autoPlayQueueRef.current = [];
                  }
                }}
              />
              <Label htmlFor="autoplay" className="text-xs font-medium cursor-pointer flex items-center gap-1">
                {autoPlay ? <Volume2 className="w-3.5 h-3.5 text-primary" /> : <VolumeX className="w-3.5 h-3.5" />}
                <span>Auto-play live audio</span>
              </Label>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Channels", value: channels.length, icon: Radio },
            { label: "Active", value: activeChannelCount, icon: Activity },
            { label: "Messages", value: totalMessages, icon: Wifi },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-card border border-border rounded-xl px-3 py-2.5 text-center">
              <Icon className="w-4 h-4 text-primary mx-auto mb-1" />
              <p className="text-lg font-bold text-foreground">{value}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Live activity ticker */}
      <AnimatePresence>
        {playingId && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-5 py-2 bg-green-500/10 border-b border-green-500/20 flex items-center gap-2"
          >
            <motion.div
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 0.5, repeat: Infinity }}
              className="w-2 h-2 bg-green-500 rounded-full"
            />
            <Volume2 className="w-3.5 h-3.5 text-green-500" />
            <span className="text-xs font-semibold text-green-400">
              Playing from: {channels.find(c => c.id === playingChannel)?.name || "Unknown Channel"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Channel grid */}
      <div className="p-3 pb-36 sm:p-4">
        {channels.length === 0 ? (
          <div className="text-center py-16">
            <WifiOff className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No channels to monitor</p>
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="channels" direction="vertical">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="grid grid-cols-1 gap-4 md:grid-cols-2"
                >
                  {orderedChannels.map((channel, index) => (
                    <Draggable key={channel.id} draggableId={channel.id} index={index}>
                      {(dragProvided) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...dragProvided.dragHandleProps}
                        >
                          <ChannelMonitorCard
                            channel={channel}
                            messages={messagesByChannel[channel.id] || []}
                            isAutoPlay={autoPlay}
                            onPlayMessage={handlePlayMessage}
                            playingId={playingId}
                            onSetProtectionLevel={handleSetProtectionLevel}
                            userMap={userMap}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>

      {/* PTT response bar */}
      {channels.length > 0 && (
        <MonitorPTTBar
          channels={channels}
          targetChannelId={targetChannelId}
          onTargetChannelChange={handleTargetChannelChange}
          broadcastAll={broadcastAll}
          onBroadcastAllChange={setBroadcastAll}
          isPressed={isPTTPressed}
          isReceiving={showReceiving}
          isChannelBusy={isChannelBusy}
          isSending={sendMutation.isPending}
          onStart={handlePTTStart}
          onStop={handlePTTStop}
        />
      )}
    </div>
  );
}