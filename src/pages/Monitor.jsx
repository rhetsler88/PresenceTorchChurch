import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "@/api/client";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Radio, Volume2, Eye, Play, Pause, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { etzTime } from "@/lib/etz";
import { deviceDayKey, deviceDayLabel } from "@/lib/deviceDate";
import { getDisplayName, getInitials, getInitialsFromName, getMonitorChannels, getReadableVoiceChannels, canSendOnChannelForChannel } from "@/lib/userUtils";
import { playClearTone, playBusyTone, unlockAudioForPTT, playTextMessageTone } from "@/lib/pttTones";
import { isProtectionLevelChangeMessage } from "@/lib/protectionLevelHistory";
import { auth } from "@/lib/firebase";
import { cleanupStalePTTSignals, claimPttChannels, releasePttSignals } from "@/lib/pttSignals";
import { playAudioUrl, stopAudio } from "@/lib/audioPlayer";
import usePttBroadcast from "../hooks/usePttBroadcast";
import usePttReceiver from "../hooks/usePttReceiver";
import useBackgroundRelayListen from "../hooks/useBackgroundRelayListen";
import useAgoraMultiListen from "../hooks/useAgoraMultiListen";
import { isAgoraEnabled } from "@/lib/agora";
import MonitorPTTBar from "../components/monitor/MonitorPTTBar";
import useExternalPTT from "../hooks/useExternalPTT";
import ProtectionLevelControl from "../components/monitor/ProtectionLevelControl";
import SetAllProtectionLevel from "../components/monitor/SetAllProtectionLevel";
import { toast } from "@/lib/toast";
import {
  recordProtectionLevelChange,
  recordProtectionLevelChanges,
} from "@/lib/protectionLevelHistory";

const MONITOR_BROADCAST_MODE_KEY = "monitorBroadcastMode";
const MONITOR_BROADCAST_SELECTION_KEY = "monitorBroadcastSelection";

function readStoredBroadcastMode() {
  const mode = localStorage.getItem(MONITOR_BROADCAST_MODE_KEY);
  return mode === "multi" ? "multi" : "single";
}

function readStoredBroadcastSelection() {
  try {
    const saved = localStorage.getItem(MONITOR_BROADCAST_SELECTION_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : null;
  } catch {
    return null;
  }
}

function ChannelMonitorCard({ channel, messages, onPlayMessage, playingId, onSetProtectionLevel, userMap }) {
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
        {messages.slice(0, 3).map(msg => (
          <div
            key={msg.id}
            className="px-4 py-2.5 flex items-start gap-2 hover:bg-muted/30 transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-[9px] font-bold text-primary">
                {userMap?.[msg.created_by_id]
                  ? getInitials(userMap[msg.created_by_id])
                  : getInitialsFromName(msg.sender_name)}
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
              {msg.text_content ? (
                <p className="text-xs text-muted-foreground truncate">{msg.text_content}</p>
              ) : msg.transcript ? (
                <p className="text-xs text-muted-foreground truncate">{msg.transcript}</p>
              ) : msg.audio_url ? (
                <p className="text-xs text-muted-foreground/50 italic">Transcribing…</p>
              ) : (
                <p className="text-xs text-muted-foreground/50 italic">Voice message</p>
              )}
            </div>
            {msg.audio_url && !msg.text_content && (
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
            )}
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
  const [playingId, setPlayingId] = useState(null);
  const [playingChannel, setPlayingChannel] = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  const [user, setUser] = useState(null);
  const [channelOrder, setChannelOrder] = useState([]);

  // PTT state (lifted from MonitorPTTBar)
  const [targetChannelId, setTargetChannelId] = useState(null);
  const [broadcastMode, setBroadcastMode] = useState(readStoredBroadcastMode);
  const [selectedBroadcastIds, setSelectedBroadcastIds] = useState([]);
  const [isPTTPressed, setIsPTTPressed] = useState(false);
  const [isChannelBusy, setIsChannelBusy] = useState(false);
  const [busyChannelIds, setBusyChannelIds] = useState(() => new Set());

  const isPlayingRef = useRef(false);
  const pttSignalRefs = useRef([]);
  const pttStartInFlightRef = useRef(null);
  const pttStopPendingRef = useRef(false);
  const pttRecordingActiveRef = useRef(false);
  const channelBusyTimeoutRef = useRef(new Map());
  const heardBroadcastsRef = useRef(new Set());
  const broadcastModeRef = useRef(broadcastMode);
  broadcastModeRef.current = broadcastMode;
  const selectedBroadcastIdsRef = useRef(selectedBroadcastIds);
  selectedBroadcastIdsRef.current = selectedBroadcastIds;
  const targetChannelIdRef = useRef(targetChannelId);
  targetChannelIdRef.current = targetChannelId;
  const sendableChannelIdsRef = useRef([]);
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

  const monitorChannels = useMemo(
    () => getMonitorChannels(user, channels),
    [user, channels]
  );
  const sendableMonitorChannels = useMemo(
    () => monitorChannels.filter((c) => canSendOnChannelForChannel(user, c)),
    [monitorChannels, user]
  );
  const sendableChannelIds = useMemo(
    () => sendableMonitorChannels.map((c) => c.id).filter(Boolean),
    [sendableMonitorChannels]
  );
  sendableChannelIdsRef.current = sendableChannelIds;
  const readableMonitorChannels = useMemo(
    () => getReadableVoiceChannels(user, monitorChannels),
    [monitorChannels, user]
  );
  const monitorChannelIds = useMemo(
    () => readableMonitorChannels.map((c) => c.id).filter(Boolean),
    [readableMonitorChannels]
  );
  const monitorChannelIdKey = monitorChannelIds.join(",");

  const { data: allMessages = [] } = useQuery({
    queryKey: ["all-channel-messages", user?.id, monitorChannelIdKey],
    enabled: !!user?.id && monitorChannelIds.length > 0,
    queryFn: async () => {
      const batches = await Promise.all(
        monitorChannelIds.map(async (id) => {
          try {
            return await api.entities.VoiceMessage.filter({ channel_id: id }, "-created_date", 3);
          } catch (err) {
            if (err?.code === "permission-denied") return [];
            throw err;
          }
        })
      );
      const items = batches.flat();
      items.sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")));
      return items;
    },
    placeholderData: keepPreviousData,
    refetchInterval: 15000,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.entities.User.list(),
  });

  // Initialize target channel from localStorage or first sendable channel
  useEffect(() => {
    if (sendableMonitorChannels.length > 0 && !targetChannelId) {
      const lastId = localStorage.getItem("lastChannelId");
      if (lastId && sendableMonitorChannels.find((c) => c.id === lastId)) {
        setTargetChannelId(lastId);
      } else {
        setTargetChannelId(sendableMonitorChannels[0].id);
      }
    }
  }, [sendableMonitorChannels, targetChannelId]);

  // Default broadcast selection: saved choice, then admin exclusions, then all sendable
  useEffect(() => {
    if (sendableChannelIds.length === 0) {
      setSelectedBroadcastIds([]);
      return;
    }
    const excluded = new Set(user?.broadcast_excluded_channels || []);
    const defaults = sendableChannelIds.filter((id) => !excluded.has(id));
    const fallback = defaults.length > 0 ? defaults : sendableChannelIds;

    setSelectedBroadcastIds((prev) => {
      const validPrev = prev.filter((id) => sendableChannelIds.includes(id));
      if (validPrev.length > 0) return validPrev;

      const stored = readStoredBroadcastSelection();
      if (stored) {
        const validStored = stored.filter((id) => sendableChannelIds.includes(id));
        if (validStored.length > 0) return validStored;
      }

      return fallback;
    });
  }, [sendableChannelIds, user?.broadcast_excluded_channels]);

  useEffect(() => {
    localStorage.setItem(MONITOR_BROADCAST_MODE_KEY, broadcastMode);
  }, [broadcastMode]);

  useEffect(() => {
    if (selectedBroadcastIds.length === 0) return;
    localStorage.setItem(
      MONITOR_BROADCAST_SELECTION_KEY,
      JSON.stringify(selectedBroadcastIds)
    );
  }, [selectedBroadcastIds]);

  // Drop target channel when it falls outside the user's monitor scope
  useEffect(() => {
    if (!targetChannelId) return;
    if (sendableMonitorChannels.length === 0) {
      setTargetChannelId(null);
      return;
    }
    if (!sendableMonitorChannels.some((c) => c.id === targetChannelId)) {
      setTargetChannelId(sendableMonitorChannels[0].id);
    }
  }, [sendableMonitorChannels, targetChannelId]);

  const getActiveTargetIds = useCallback(() => {
    if (broadcastModeRef.current === "multi") {
      return selectedBroadcastIdsRef.current.filter((id) =>
        sendableChannelIdsRef.current.includes(id)
      );
    }
    const targetId = targetChannelIdRef.current;
    return [targetId].filter((id) => id && sendableChannelIdsRef.current.includes(id));
  }, []);

  const handleTargetChannelChange = useCallback((id) => {
    setTargetChannelId(id);
    localStorage.setItem("lastChannelId", id);
  }, []);

  const monitorRelayChannelIds = useMemo(
    () => monitorChannels.map((c) => c.id).filter(Boolean),
    [monitorChannels]
  );

  const agoraEnabled = isAgoraEnabled();

  const {
    startRecording,
    stopRecording,
    stopLiveTransmit,
    heardBroadcastsRef: pttHeardRef,
  } = usePttBroadcast({
    channelId: targetChannelId,
    userId: user?.id,
    userName: user ? getDisplayName(user) : "",
    listenActive: false,
    receiveEnabled: false,
  });

  const { isReceiving: agoraMultiReceiving } = useAgoraMultiListen({
    userId: user?.id,
    channelIds: agoraEnabled ? monitorRelayChannelIds : [],
    onRemoteTalkStart: (_channelId, _uid) => {},
  });

  const { isReceiving: multiLiveReceiving, heardBroadcastsRef: multiHeardRef } = usePttReceiver({
    channelIds: monitorRelayChannelIds,
    userId: user?.id,
  });

  useBackgroundRelayListen({
    enabled: Boolean(user?.id && monitorRelayChannelIds.length > 0),
    title: "Monitor",
  });

  const isLiveReceiving = agoraEnabled
    ? (agoraMultiReceiving || multiLiveReceiving)
    : multiLiveReceiving;

  // Per-channel PTT subscriptions — collection-wide queries fail Firestore rules for partial access
  useEffect(() => {
    if (!user?.id || monitorChannelIds.length === 0) return;

    const unsub = api.entities.PTTSignal.subscribeMany(
      (event) => {
        if (event.data?.sender_id === user.id) return;

        const channelId = event.data.channel_id;
        if (event.type === "create") {
          if (event.data?.broadcast_id) {
            heardBroadcastsRef.current.add(event.data.broadcast_id);
          }
          playClearTone();
          setBusyChannelIds((prev) => new Set(prev).add(channelId));
          setIsChannelBusy(true);
          const prevTimeout = channelBusyTimeoutRef.current.get(channelId);
          if (prevTimeout) clearTimeout(prevTimeout);
          channelBusyTimeoutRef.current.set(channelId, setTimeout(() => {
            channelBusyTimeoutRef.current.delete(channelId);
            setBusyChannelIds((prev) => {
              const next = new Set(prev);
              next.delete(channelId);
              setIsChannelBusy(next.size > 0);
              return next;
            });
          }, 15000));
        } else if (event.type === "delete") {
          const prevTimeout = channelBusyTimeoutRef.current.get(channelId);
          if (prevTimeout) {
            clearTimeout(prevTimeout);
            channelBusyTimeoutRef.current.delete(channelId);
          }
          setBusyChannelIds((prev) => {
            const next = new Set(prev);
            next.delete(channelId);
            setIsChannelBusy(next.size > 0);
            return next;
          });
        }
      },
      monitorChannelIds.map((channelId) => ({ channel_id: channelId }))
    );
    return unsub;
  }, [monitorChannelIdKey, user?.id]);

  // Clean up stale PTT signals on mount
  useEffect(() => {
    if (!user?.id) return;
    cleanupStalePTTSignals({ channelIds: monitorChannelIds, excludeSenderId: user.id })
      .then((active) => {
        if (active.length > 0) {
          setBusyChannelIds(new Set(active.map((s) => s.channel_id)));
          setIsChannelBusy(true);
        }
      })
      .catch(() => {});
  }, [monitorChannelIdKey, user?.id]);

  // Clean up PTT signals on unmount
  useEffect(() => {
    const deleteOwnSignals = () => {
      const ids = [...pttSignalRefs.current];
      pttSignalRefs.current = [];
      ids.forEach((id) => api.entities.PTTSignal.delete(id).catch(() => {}));
    };

    const handlePageExit = () => deleteOwnSignals();
    window.addEventListener("pagehide", handlePageExit);

    return () => {
      window.removeEventListener("pagehide", handlePageExit);
      deleteOwnSignals();
      for (const timeout of channelBusyTimeoutRef.current.values()) {
        clearTimeout(timeout);
      }
      channelBusyTimeoutRef.current.clear();
    };
  }, []);

  // Ordered channels: saved order first, then any new channels appended
  const orderedChannels = useMemo(() => {
    const orderMap = {};
    channelOrder.forEach((id, idx) => { orderMap[id] = idx; });
    return [...monitorChannels].sort((a, b) => {
      const ai = orderMap[a.id] ?? 9999;
      const bi = orderMap[b.id] ?? 9999;
      if (ai === bi) return 0;
      return ai - bi;
    });
  }, [monitorChannels, channelOrder]);

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
  monitorChannels.forEach(c => { messagesByChannel[c.id] = []; });
  allMessages.forEach(m => {
    if (messagesByChannel[m.channel_id]) {
      messagesByChannel[m.channel_id].push(m);
    }
  });

  // Real-time subscription scoped to monitor channels
  useEffect(() => {
    if (!user?.id || monitorChannelIds.length === 0) return;

    const onEvent = (event) => {
      if (!monitorChannelIds.includes(event.data?.channel_id)) return;

      queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });

      if (event.type !== "create") return;

      // Skip activity if already heard via live Agora/relay
      if (event.data?.broadcast_id && (
        heardBroadcastsRef.current.has(event.data.broadcast_id)
        || pttHeardRef.current.has(event.data.broadcast_id)
        || multiHeardRef.current.has(event.data.broadcast_id)
      )) {
        return;
      }

      if (event.data?.audio_url && event.data.created_by_id !== user.id) {
        const channel = monitorChannels.find((c) => c.id === event.data.channel_id);
        setActivityLog((prev) => [{
          ...event.data,
          channelName: channel?.name || "Unknown",
          channelColor: channel?.color || "#f59e0b",
          ts: new Date(),
        }, ...prev].slice(0, 20));
        return;
      }

      if (
        event.data?.text_content
        && !event.data?.audio_url
        && event.data.created_by_id !== user.id
        && !isProtectionLevelChangeMessage(event.data)
      ) {
        playTextMessageTone();
      }
    };

    const unsub = api.entities.VoiceMessage.subscribeMany(
      onEvent,
      monitorChannelIds.map((channelId) => ({ channel_id: channelId }))
    );
    return unsub;
  }, [monitorChannelIds, monitorChannels, user, queryClient, heardBroadcastsRef, pttHeardRef, multiHeardRef]);

  const handlePlayMessage = (msg) => {
    if (!msg.audio_url) return;
    if (playingId === msg.id) {
      stopAudio();
      setPlayingId(null);
      setPlayingChannel(null);
      isPlayingRef.current = false;
      return;
    }
    stopAudio();
    isPlayingRef.current = true;
    setPlayingId(msg.id);
    setPlayingChannel(msg.channel_id);
    playAudioUrl(msg.audio_url, {
      onEnded: () => {
        setPlayingId(null);
        setPlayingChannel(null);
        isPlayingRef.current = false;
      },
      onError: () => {
        setPlayingId(null);
        setPlayingChannel(null);
        isPlayingRef.current = false;
        toast.error("Could not play audio");
      },
    }).catch(() => {
      setPlayingId(null);
      setPlayingChannel(null);
      isPlayingRef.current = false;
      toast.error("Could not play audio");
    });
  };

  // Set protection level (synced to Talk page in real-time)
  const handleSetProtectionLevel = async (channelId, level) => {
    const channels = queryClient.getQueryData(["channels"]) || [];
    const channel = channels.find((c) => c.id === channelId);
    const fromLevel = channel?.protection_level || "green";

    await api.entities.Channel.update(channelId, { protection_level: level });
    await recordProtectionLevelChange({
      channelId,
      fromLevel,
      toLevel: level,
      queryClient,
    });
    queryClient.invalidateQueries({ queryKey: ["channels"] });
    toast.success(`Protection level set to ${level}`);
  };

  // Set protection level across all channels at once
  const handleSetAllProtectionLevel = async (level) => {
    try {
      const channels = queryClient.getQueryData(["channels"]) || [];
      await api.entities.Channel.updateMany({}, { $set: { protection_level: level } });
      await recordProtectionLevelChanges(channels, level, queryClient);
      queryClient.setQueryData(["channels"], (/** @type {any[] | undefined} */ old) =>
        (old ?? []).map((c) => ({ ...c, protection_level: level }))
      );
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      toast.success(`All channels set to ${level}`);
    } catch (err) {
      console.error("Set all protection level failed:", err);
      toast.error("Could not update protection levels");
    }
  };

  // PTT send � uses relay broadcast result (already uploaded)
  const sendMutation = useMutation({
    mutationFn: async () => {
      const result = await stopRecording();

      if (!result) return null;
      const { file_url, duration, broadcast_id } = result;

      const now = new Date();
      const deviceTime = now.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true
      });
      const deviceDate = deviceDayKey(now);
      const targetIds = broadcastModeRef.current === "multi"
        ? selectedBroadcastIdsRef.current.filter((id) =>
            sendableChannelIdsRef.current.includes(id)
          )
        : [targetChannelIdRef.current].filter(
            (id) => id && sendableChannelIdsRef.current.includes(id)
          );
      const targetId = targetChannelIdRef.current;

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
          ...(broadcast_id ? { broadcast_id } : {}),
        })
      ));

      // Clean up relay chunks for the target channel
      if (broadcast_id) {
        api.entities.AudioChunk.deleteMany({ broadcast_id }).catch(() => {});
      }

      queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
      queryClient.invalidateQueries({ queryKey: ["all-messages"] });

      // Transcribe each message in the background
      created.forEach(msg => {
        api.functions.invoke("transcribeAudio", {
          audio_url: file_url,
          message_id: msg.id,
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
          queryClient.invalidateQueries({ queryKey: ["all-messages"] });
        }).catch(async () => {
          await api.entities.VoiceMessage.update(msg.id, {
            transcript: "[Transcription unavailable]",
            is_transcribed: true,
          });
          queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
          queryClient.invalidateQueries({ queryKey: ["all-messages"] });
        });
      });

      const mode = broadcastModeRef.current;
      if (mode === "multi") {
        const allCount = sendableChannelIdsRef.current.length;
        return targetIds.length === allCount
          ? `all ${targetIds.length} channels`
          : `${targetIds.length} channels`;
      }
      return monitorChannels.find(c => c.id === targetId)?.name || "channel";
    },
    onSuccess: (label) => {
      if (label) toast.success(`Sent to ${label}`);
    },
  });

  const activeTargetIds = useMemo(() => {
    if (broadcastMode === "multi") {
      return selectedBroadcastIds.filter((id) => sendableChannelIds.includes(id));
    }
    return targetChannelId ? [targetChannelId] : [];
  }, [broadcastMode, selectedBroadcastIds, sendableChannelIds, targetChannelId]);

  const isTargetChannelBusy = activeTargetIds.some((id) => busyChannelIds.has(id));

  const finishPttStop = useCallback(() => {
    const signalIds = [...pttSignalRefs.current];
    pttSignalRefs.current = [];
    signalIds.forEach((id) => {
      api.entities.PTTSignal.delete(id).catch(() => {});
    });

    void stopLiveTransmit();

    if (pttRecordingActiveRef.current) {
      pttRecordingActiveRef.current = false;
      sendMutation.mutate();
    }
  }, [sendMutation, stopLiveTransmit]);

  const handlePTTStart = useCallback(async () => {
    if (isPTTPressed || !user?.id || pttStartInFlightRef.current || pttRecordingActiveRef.current) return;
    if (isLiveReceiving || isTargetChannelBusy || isPlayingRef.current) {
      playBusyTone();
      return;
    }

    const targetIds = getActiveTargetIds();
    const primaryChannelId = targetIds[0] || sendableChannelIds[0];

    if (targetIds.length === 0) {
      toast.error("No channels available to respond on");
      return;
    }

    unlockAudioForPTT();
    playClearTone();
    setIsPTTPressed(true);
    pttStopPendingRef.current = false;
    pttRecordingActiveRef.current = false;

    const startSequence = (async () => {
      const broadcastId = crypto.randomUUID();
      try {
        try {
          await auth.currentUser?.getIdToken(true);
        } catch (syncErr) {
          console.warn("PTT token refresh failed:", syncErr);
        }

        if (pttSignalRefs.current.length) {
          await releasePttSignals(pttSignalRefs.current);
          pttSignalRefs.current = [];
        }

        await cleanupStalePTTSignals({
          channelIds: targetIds,
          excludeSenderId: user.id,
        }).catch(() => {});

        // Claim channels immediately so members hear the clear tone without waiting for mic setup.
        const claimPromise = claimPttChannels({
          channelIds: targetIds,
          senderId: user.id,
          senderName: getDisplayName(user),
          broadcastId,
          primaryChannelId,
        });

        const started = await startRecording({ broadcastId, publishChannelIds: targetIds });

        if (pttStopPendingRef.current) {
          if (started) {
            pttRecordingActiveRef.current = true;
            return { pendingSend: true };
          }
          return { aborted: true };
        }

        if (!started) {
          try {
            const { signalIds } = await claimPromise;
            await releasePttSignals(signalIds);
          } catch {
            // claim may still be in flight
          }
          return { micDenied: true };
        }

        pttRecordingActiveRef.current = true;
        heardBroadcastsRef.current.add(broadcastId);

        let signalIds = [];
        try {
          ({ signalIds } = await claimPromise);
          pttSignalRefs.current = signalIds;
        } catch (err) {
          console.error("PTT signal create failed:", err);
          await releasePttSignals(pttSignalRefs.current);
          pttSignalRefs.current = [];
          return { claimFailed: true, error: err };
        }

        if (pttStopPendingRef.current) {
          return { pendingSend: true };
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
      toast.error("Could not start broadcast");
      return;
    }

    if (result.claimFailed) {
      await releasePttSignals(pttSignalRefs.current);
      pttSignalRefs.current = [];
      await stopRecording().catch(() => {});
      setIsPTTPressed(false);
      toast.error(
        result.error?.code === "permission-denied"
          ? "Permission denied — cannot respond on one or more channels"
          : "Could not claim channel — try again"
      );
      return;
    }

    if (result.micDenied) {
      setIsPTTPressed(false);
      toast.error("Microphone access denied");
      return;
    }
  }, [
    isPTTPressed,
    isLiveReceiving,
    isTargetChannelBusy,
    startRecording,
    stopRecording,
    getActiveTargetIds,
    sendableChannelIds,
    user,
    finishPttStop,
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

  const showReceiving = isLiveReceiving && !isPTTPressed;

  return (
    <div className="min-h-screen safe-top">
      {/* Header */}
      <div className="px-4 pt-4 pb-4 border-b border-border sm:px-5 sm:pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:pr-48">
          <div>
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-bold text-foreground sm:text-xl">Channel Monitor</h1>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Listening across all channels</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <SetAllProtectionLevel onApply={handleSetAllProtectionLevel} />
          </div>
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
              Playing from: {monitorChannels.find(c => c.id === playingChannel)?.name || "Unknown Channel"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Channel grid */}
      <div className="p-3 pb-36 sm:p-4">
        {monitorChannels.length === 0 ? (
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
      {monitorChannels.length > 0 && sendableMonitorChannels.length > 0 && (
        <MonitorPTTBar
          channels={sendableMonitorChannels}
          mode={broadcastMode}
          onModeChange={setBroadcastMode}
          targetChannelId={targetChannelId}
          onTargetChannelChange={handleTargetChannelChange}
          selectedChannelIds={selectedBroadcastIds}
          onSelectedChannelIdsChange={setSelectedBroadcastIds}
          isPressed={isPTTPressed}
          isReceiving={showReceiving}
          isChannelBusy={isTargetChannelBusy && !isPTTPressed && !showReceiving}
          isSending={sendMutation.isPending}
          onStart={handlePTTStart}
          onStop={handlePTTStop}
        />
      )}
    </div>
  );
}