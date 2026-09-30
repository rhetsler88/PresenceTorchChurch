import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Radio, Volume2, VolumeX, Eye, Play, Pause, WifiOff, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { etzTime } from "@/lib/etz";
import { deviceDayKey, deviceDayLabel } from "@/lib/deviceDate";
import {
  getDisplayName,
  getInitials,
  getInitialsFromName,
  getMonitorChannels,
  canSendOnChannelForChannel,
  canManageChannelProtection,
  filterAppVisibleMessages,
} from "@/lib/userUtils";
import { applyBulkProtectionLevelUpdate } from "@/lib/protectionSetAll";
import { playClearTone, playBusyTone, ensureAudioReady, unlockAudioForPTT } from "@/lib/pttTones";
import { logVoiceMessageFailure } from "@/lib/voiceMessageLogging";
import { markBroadcastHeard, hasHeardBroadcast } from "@/lib/heardBroadcasts";
import { auth } from "@/lib/firebase";
import {
  cleanupStalePTTSignals,
  claimPttChannels,
  discardPttRecording,
  releasePttSignals,
} from "@/lib/pttSignals";
import { pttDebugLog } from "@/lib/pttDebugLog";
import { playAudioUrl, stopAudio } from "@/lib/audioPlayer";
import { formatAudioPlaybackToast } from "@/lib/secureAudio";
import { needsTranscription, requestTranscription } from "@/lib/transcription";
import usePttBroadcast from "../hooks/usePttBroadcast";
import useChannels from "@/hooks/useChannels";
import usePttBusyChannels from "@/hooks/usePttBusyChannels";
import { usePassiveMonitor } from "../components/monitor/PassiveMonitorProvider";
import MonitorPTTBar from "../components/monitor/MonitorPTTBar";
import { useRegisterPagePTTHandlers } from "@/components/ptt/PTTHandlerProvider";
import ProtectionLevelControl from "../components/monitor/ProtectionLevelControl";
import SetAllProtectionLevel from "../components/monitor/SetAllProtectionLevel";
import { toast } from "@/lib/toast";
import { recordSessionInteraction } from "@/lib/logoutOnClose";
import { recordProtectionLevelChange } from "@/lib/protectionLevelHistory";
import { partitionBroadcastTargets } from "@/lib/partitionBroadcastTargets";

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

function sortMessagesNewestFirst(messages = []) {
  return [...messages].sort((a, b) =>
    String(b.created_date || "").localeCompare(String(a.created_date || ""))
  );
}

function takeRecentMessages(messages = [], count = 3) {
  return sortMessagesNewestFirst(messages).slice(0, count);
}

function ChannelMonitorCard({
  channel,
  messages,
  onPlayMessage,
  playingId,
  onSetProtectionLevel,
  onOpenChannel,
  userMap,
  isMuted,
  onToggleMute,
  isLiveBroadcasting,
  dragHandleProps,
}) {
  const recentMessages = messages.slice(0, 3);
  const isPlayingHere = playingId && messages.some((m) => m.id === playingId);
  const showLiveBadge = isLiveBroadcasting || isPlayingHere;

  return (
    <div className={`w-full bg-card border rounded-2xl overflow-hidden transition-all duration-300 ${
      showLiveBadge
        ? "border-green-500/50 shadow-lg shadow-green-500/10"
        : "border-border"
    }`}>
      {/* Channel header */}
      <div className="w-full px-4 py-3 flex items-center gap-3 border-b border-border">
        <button
          type="button"
          {...dragHandleProps}
          className="p-1.5 -ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 touch-none cursor-grab active:cursor-grabbing flex-shrink-0"
          aria-label={`Reorder ${channel.name}`}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onOpenChannel?.(channel.id)}
          className="flex flex-1 items-center gap-3 min-w-0 text-left hover:opacity-90 transition-opacity"
        >
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-shadow ${
              isLiveBroadcasting ? "ring-2 ring-green-500/80 ring-offset-2 ring-offset-card" : ""
            }`}
            style={{ backgroundColor: (channel.color || "#f59e0b") + "20" }}
          >
            <Radio className="w-4 h-4" style={{ color: channel.color || "#f59e0b" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{channel.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {isMuted ? "Muted" : isLiveBroadcasting ? "Live broadcast" : "Listening"} · {recentMessages.length} recent
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => onToggleMute?.(channel.id)}
          className={`p-2 rounded-lg border transition-colors flex-shrink-0 ${
            isMuted
              ? "border-border text-muted-foreground hover:text-foreground"
              : "border-primary/30 text-primary hover:bg-primary/10"
          }`}
          aria-label={isMuted ? `Unmute ${channel.name}` : `Mute ${channel.name}`}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        {showLiveBadge && (
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            className="flex items-center gap-1 text-green-500 flex-shrink-0"
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
          channelName={channel.name}
          onChange={(lvl) => onSetProtectionLevel(channel.id, lvl)}
        />
      </div>

      {/* Message list */}
      <div className="divide-y divide-border">
        {recentMessages.map(msg => (
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
        {recentMessages.length === 0 && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-muted-foreground">No activity yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Monitor() {
  const navigate = useNavigate();
  const passiveMonitor = usePassiveMonitor();
  const {
    heardBroadcastsRef: passiveHeardRef,
    relayHeardRef,
    agoraHeardRef,
    isLiveReceiving,
    isMuted,
    toggleMute,
  } = passiveMonitor || {};
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

  const isPlayingRef = useRef(false);
  const pttSignalRefs = useRef([]);
  const pttStartInFlightRef = useRef(null);
  const pttStopPendingRef = useRef(false);
  const pttRecordingActiveRef = useRef(false);
  /** Channel ids claimed for the in-flight / active monitor PTT (may exclude busy targets). */
  const pttSessionTargetIdsRef = useRef(null);
  const isPTTPressedRef = useRef(false);
  const pttMaxDurationStopRef = useRef(() => {});
  const heardBroadcastsRef = useRef(new Set());
  const broadcastModeRef = useRef(broadcastMode);
  broadcastModeRef.current = broadcastMode;
  const selectedBroadcastIdsRef = useRef(selectedBroadcastIds);
  selectedBroadcastIdsRef.current = selectedBroadcastIds;
  const targetChannelIdRef = useRef(targetChannelId);
  targetChannelIdRef.current = targetChannelId;
  const sendableChannelIdsRef = useRef([]);
  const queryClient = useQueryClient();

  const monitorOrderKey = user?.id ? `monitorChannelOrder_${user.id}` : null;

  useEffect(() => {
    if (!monitorOrderKey) return;
    const saved = localStorage.getItem(monitorOrderKey);
    if (saved) {
      try {
        setChannelOrder(JSON.parse(saved));
      } catch {
        setChannelOrder([]);
      }
    } else {
      setChannelOrder([]);
    }
  }, [monitorOrderKey]);

  useEffect(() => {
    if (!monitorOrderKey) return;
    localStorage.setItem(monitorOrderKey, JSON.stringify(channelOrder));
  }, [channelOrder, monitorOrderKey]);

  useEffect(() => { api.auth.me().then(setUser); }, []);

  useEffect(() => {
    ensureAudioReady();
  }, []);

  const { data: channels = [] } = useChannels();

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
  const monitorChannelIds = useMemo(
    () => monitorChannels.map((c) => c.id).filter(Boolean),
    [monitorChannels]
  );
  const monitorChannelIdKey = monitorChannelIds.join(",");

  const { busyChannelIds } = usePttBusyChannels({
    channelIds: monitorChannelIds,
    userId: user?.id ?? null,
    enabled: Boolean(user?.id && monitorChannelIds.length > 0),
  });

  const { data: messagesByChannel = {} } = useQuery({
    queryKey: ["all-channel-messages", user?.id, monitorChannelIdKey],
    enabled: !!user?.id && monitorChannelIds.length > 0,
    queryFn: async () => {
      try {
        await auth.currentUser?.getIdToken(true);
      } catch {
        // Continue with cached token if refresh fails.
      }
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
      const grouped = {};
      monitorChannelIds.forEach((id) => { grouped[id] = []; });
      batches.forEach((batch, index) => {
        const channelId = monitorChannelIds[index];
        if (!channelId) return;
        grouped[channelId] = batch;
      });
      return grouped;
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

  // Default broadcast selection: saved choice, then all sendable (exclusions removed upstream)
  useEffect(() => {
    if (sendableChannelIds.length === 0) {
      setSelectedBroadcastIds([]);
      return;
    }

    setSelectedBroadcastIds((prev) => {
      const validPrev = prev.filter((id) => sendableChannelIds.includes(id));
      if (validPrev.length > 0) return validPrev;

      const stored = readStoredBroadcastSelection();
      if (stored) {
        const validStored = stored.filter((id) => sendableChannelIds.includes(id));
        if (validStored.length > 0) return validStored;
      }

      return sendableChannelIds;
    });
  }, [sendableChannelIds]);

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

  const warmPublishChannelIds = useMemo(() => {
    if (broadcastMode === "multi") {
      return selectedBroadcastIds.filter((id) => sendableChannelIds.includes(id));
    }
    return targetChannelId && sendableChannelIds.includes(targetChannelId)
      ? [targetChannelId]
      : [];
  }, [broadcastMode, selectedBroadcastIds, sendableChannelIds, targetChannelId]);

  const handleTargetChannelChange = useCallback((id) => {
    setTargetChannelId(id);
    localStorage.setItem("lastChannelId", id);
    recordSessionInteraction();
  }, []);

  const handleBroadcastModeChange = useCallback((mode) => {
    setBroadcastMode(mode);
    recordSessionInteraction();
  }, []);

  const handleSelectedBroadcastIdsChange = useCallback((ids) => {
    setSelectedBroadcastIds(ids);
    recordSessionInteraction();
  }, []);

  const handleOpenChannelInTalk = useCallback((channelId) => {
    if (!channelId) return;
    localStorage.setItem("lastChannelId", channelId);
    navigate(`/?channel=${channelId}`);
  }, [navigate]);

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
    warmJoin: false,
    warmPublishChannelIds,
    onMaxDurationRef: pttMaxDurationStopRef,
  });

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

  const userMap = useMemo(() => {
    const map = {};
    users.forEach((u) => { map[u.id] = u; });
    return map;
  }, [users]);

  const channelMessages = useCallback(
    (channelId) => takeRecentMessages(messagesByChannel[channelId] || []),
    [messagesByChannel]
  );

  const patchChannelMessagesCache = useCallback((channelId, updater) => {
    if (!channelId || !user?.id) return;
    queryClient.setQueryData(
      ["all-channel-messages", user.id, monitorChannelIdKey],
      (old) => {
        const grouped = { ...(old || {}) };
        const next = updater(grouped[channelId] || []);
        grouped[channelId] = takeRecentMessages(next);
        return grouped;
      }
    );
  }, [monitorChannelIdKey, queryClient, user?.id]);

  const liveBroadcastChannels = useMemo(
    () => orderedChannels.filter((channel) => busyChannelIds.has(channel.id)),
    [orderedChannels, busyChannelIds]
  );

  // Real-time subscription scoped to monitor channels
  useEffect(() => {
    if (!user?.id || monitorChannelIds.length === 0) return;

    const onEvent = (event) => {
      const channelId = event.data?.channel_id;
      if (!channelId || !monitorChannelIds.includes(channelId)) return;

      if (event.type === "create") {
        patchChannelMessagesCache(channelId, (prev) => {
          if (filterAppVisibleMessages([event.data]).length === 0) return prev;
          const without = prev.filter((msg) => msg.id !== event.data.id);
          return [event.data, ...without];
        });
      } else if (event.type === "update") {
        patchChannelMessagesCache(channelId, (prev) =>
          prev.map((msg) => (msg.id === event.data.id ? { ...msg, ...event.data } : msg))
        );
      } else if (event.type === "delete") {
        patchChannelMessagesCache(channelId, (prev) =>
          prev.filter((msg) => msg.id !== event.data?.id)
        );
        queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
      }

      if (event.type !== "create") return;

      // Skip notifications for broadcasts already heard live (Agora/relay/PTT signal).
      if (hasHeardBroadcast(
        event.data?.broadcast_id,
        heardBroadcastsRef,
        pttHeardRef,
        passiveHeardRef,
        relayHeardRef,
        agoraHeardRef
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
    };

    const unsub = api.entities.VoiceMessage.subscribeMany(
      onEvent,
      monitorChannelIds.map((channelId) => ({ channel_id: channelId }))
    );
    return unsub;
  }, [
    monitorChannelIds,
    monitorChannels,
    user,
    queryClient,
    patchChannelMessagesCache,
    heardBroadcastsRef,
    pttHeardRef,
    passiveHeardRef,
    relayHeardRef,
    agoraHeardRef,
  ]);

  const transcribeOnReplay = useCallback(async (msg) => {
    if (!needsTranscription(msg)) return;
    try {
      await requestTranscription(msg);
      queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
      queryClient.invalidateQueries({ queryKey: ["all-messages"] });
    } catch {
      // Ignore — user can replay again or export will batch-transcribe.
    }
  }, [queryClient]);

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
    void transcribeOnReplay(msg);
    let playErrorReported = false;
    const reportPlayError = (err) => {
      if (playErrorReported) return;
      playErrorReported = true;
      setPlayingId(null);
      setPlayingChannel(null);
      isPlayingRef.current = false;
      toast.error(formatAudioPlaybackToast(err));
    };
    playAudioUrl(msg.audio_url, {
      speakerUserId: msg.created_by_id,
      onEnded: () => {
        setPlayingId(null);
        setPlayingChannel(null);
        isPlayingRef.current = false;
      },
      onError: reportPlayError,
    }).catch(reportPlayError);
  };

  // Set protection level (synced to Talk page in real-time)
  const handleSetProtectionLevel = async (channelId, level) => {
    const channels = queryClient.getQueryData(["channels"]) || [];
    const channel = channels.find((c) => c.id === channelId);
    if (!channel || !canManageChannelProtection(user, channel)) {
      toast.error("Only admins and team leads can change protection levels.");
      return;
    }
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
      const { targetIds } = await applyBulkProtectionLevelUpdate({
        channels,
        user,
        level,
        queryClient,
      });
      if (targetIds.length === 0) {
        toast.info("No channels in your organization to update");
        return;
      }
      const idSet = new Set(targetIds);
      queryClient.setQueryData(["channels"], (/** @type {any[] | undefined} */ old) =>
        (old ?? []).map((c) => (idSet.has(c.id) ? { ...c, protection_level: level } : c))
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
      const sessionTargets = pttSessionTargetIdsRef.current;
      const targetIds =
        sessionTargets?.length
          ? sessionTargets
          : broadcastModeRef.current === "multi"
            ? selectedBroadcastIdsRef.current.filter((id) =>
                sendableChannelIdsRef.current.includes(id)
              )
            : [targetChannelIdRef.current].filter(
                (id) => id && sendableChannelIdsRef.current.includes(id)
              );
      const targetId = targetChannelIdRef.current;

      const result = await stopRecording();

      if (!result) {
        void logVoiceMessageFailure({
          source: "monitor",
          stage: "recording",
          error: Object.assign(new Error("Recording produced no audio or upload failed"), {
            code: "app/recording-failed",
          }),
          channelId: targetId,
          channelIds: targetIds,
          user,
        });
        return null;
      }
      const { file_url, duration, broadcast_id } = result;

      const now = new Date();
      const deviceTime = now.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true
      });
      const deviceDate = deviceDayKey(now);

      try {
        await Promise.all(targetIds.map(cid =>
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
      } catch (err) {
        err.logged = true;
        void logVoiceMessageFailure({
          source: "monitor",
          stage: "create",
          error: err,
          channelId: targetId,
          channelIds: targetIds,
          broadcastId: broadcast_id,
          durationSeconds: duration,
          user,
          extra: { audio_url: file_url },
        });
        throw err;
      }

      // Clean up relay chunks for the target channel
      if (broadcast_id) {
        api.entities.AudioChunk.deleteMany({ broadcast_id }).catch(() => {});
      }

      // Invalidate caches; voice archives are never auto-played (live Agora/relay only).
      queryClient.invalidateQueries({ queryKey: ["all-channel-messages"] });
      queryClient.invalidateQueries({ queryKey: ["all-messages"] });

      markBroadcastHeard(
        broadcast_id,
        heardBroadcastsRef,
        pttHeardRef,
        passiveHeardRef,
        relayHeardRef,
        agoraHeardRef
      );

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
    onError: (err) => {
      if (err?.logged) return;
      const isRecordingStage =
        err?.code === "app/recording-failed" || err?.code === "storage/unauthorized";
      void logVoiceMessageFailure({
        source: "monitor",
        stage: isRecordingStage ? "recording" : "create",
        error: err,
        channelId: targetChannelIdRef.current,
        channelIds: broadcastModeRef.current === "multi"
          ? selectedBroadcastIdsRef.current
          : [targetChannelIdRef.current].filter(Boolean),
        user,
      });
    },
  });

  const activeTargetIds = useMemo(() => {
    if (broadcastMode === "multi") {
      return selectedBroadcastIds.filter((id) => sendableChannelIds.includes(id));
    }
    return targetChannelId ? [targetChannelId] : [];
  }, [broadcastMode, selectedBroadcastIds, sendableChannelIds, targetChannelId]);

  const { freeIds: freeBroadcastTargetIds, busyIds: busyBroadcastTargetIds } = useMemo(
    () => partitionBroadcastTargets(activeTargetIds, busyChannelIds),
    [activeTargetIds, busyChannelIds]
  );
  const allBroadcastTargetsBusy =
    activeTargetIds.length > 0 && freeBroadcastTargetIds.length === 0;

  const finishPttStop = useCallback(() => {
    const signalIds = [...pttSignalRefs.current];
    pttSignalRefs.current = [];
    signalIds.forEach((id) => {
      api.entities.PTTSignal.delete(id).catch(() => {});
    });
    pttSessionTargetIdsRef.current = null;

    if (pttRecordingActiveRef.current) {
      pttRecordingActiveRef.current = false;
      sendMutation.mutate();
      return;
    }

    void stopLiveTransmit();
    void discardPttRecording(stopRecording, {
      source: "monitor",
      channelId: targetChannelIdRef.current,
      channelIds: broadcastModeRef.current === "multi"
        ? selectedBroadcastIdsRef.current
        : [targetChannelIdRef.current].filter(Boolean),
      user,
      reason: "PTT released before recording was committed",
    });
  }, [sendMutation, stopLiveTransmit, stopRecording, user]);

  const handlePTTStart = useCallback(async () => {
    if (isPTTPressed || !user?.id || pttStartInFlightRef.current || pttRecordingActiveRef.current) return;
    if (isPlayingRef.current) return;

    const activeIds = getActiveTargetIds();
    const { freeIds, busyIds } = partitionBroadcastTargets(activeIds, busyChannelIds);

    if (activeIds.length === 0) {
      toast.error("No channels available to respond on");
      return;
    }

    if (freeIds.length === 0) {
      playBusyTone();
      toast.error("Channel busy");
      return;
    }

    if (busyIds.length > 0) {
      const skippedNames = busyIds
        .map((id) => monitorChannels.find((c) => c.id === id)?.name || id)
        .join(", ");
      toast.info(`Skipped busy channel${busyIds.length === 1 ? "" : "s"}: ${skippedNames}`);
    }

    const targetIds = freeIds;
    pttSessionTargetIdsRef.current = freeIds;
    const primaryChannelId = targetIds[0] || sendableChannelIds[0];

    recordSessionInteraction();
    unlockAudioForPTT();
    const broadcastId = crypto.randomUUID();
    const clearToneDone = playClearTone(broadcastId);

    isPTTPressedRef.current = true;
    setIsPTTPressed(true);
    pttStopPendingRef.current = false;
    pttRecordingActiveRef.current = false;

    pttDebugLog("ptt.press", { surface: "monitor", channelIds: targetIds, broadcastId });

    const startSequence = (async () => {
      pttDebugLog("ptt.sequence.start", { surface: "monitor", broadcastId, channelIds: targetIds });
      try {
        if (pttSignalRefs.current.length) {
          await releasePttSignals(pttSignalRefs.current);
          pttSignalRefs.current = [];
        }

        void auth.currentUser?.getIdToken(true).catch((syncErr) => {
          console.warn("PTT token refresh failed:", syncErr);
        });

        void cleanupStalePTTSignals({
          channelIds: targetIds,
          excludeSenderId: user.id,
        }).catch(() => {});

        if (pttStopPendingRef.current) {
          return { aborted: true };
        }

        pttDebugLog("ptt.claim.sent", { surface: "monitor", broadcastId, channelIds: targetIds });
        const claimResult = await claimPttChannels({
          channelIds: targetIds,
          senderId: user.id,
          senderName: getDisplayName(user),
          broadcastId,
          primaryChannelId,
        });

        if (!claimResult.won) {
          return {
            channelBusy: true,
            holder: claimResult.holder,
            busyChannelId: claimResult.channelId,
          };
        }

        if (pttStopPendingRef.current) {
          await releasePttSignals(claimResult.signalIds);
          pttSignalRefs.current = [];
          return { aborted: true };
        }

        pttSignalRefs.current = claimResult.signalIds;

        await clearToneDone;
        const started = await startRecording({ broadcastId, publishChannelIds: targetIds });

        if (pttStopPendingRef.current) {
          if (started) {
            pttRecordingActiveRef.current = true;
            return { pendingSend: true };
          }
          await releasePttSignals(claimResult.signalIds);
          pttSignalRefs.current = [];
          await discardPttRecording(stopRecording, {
            source: "monitor",
            channelId: primaryChannelId,
            channelIds: targetIds,
            user,
            reason: "PTT released during startup before mic was ready",
          });
          return { aborted: true };
        }

        if (!started) {
          await releasePttSignals(claimResult.signalIds);
          pttSignalRefs.current = [];
          await discardPttRecording(stopRecording, {
            source: "monitor",
            channelId: primaryChannelId,
            channelIds: targetIds,
            user,
            reason: "Microphone unavailable after channel claim",
          });
          return { micDenied: true };
        }

        pttRecordingActiveRef.current = true;
        markBroadcastHeard(broadcastId, heardBroadcastsRef, pttHeardRef);

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
      isPTTPressedRef.current = false;
      setIsPTTPressed(false);
      if (pttRecordingActiveRef.current || cancelled) {
        finishPttStop();
      } else {
        pttSessionTargetIdsRef.current = null;
      }
      return;
    }

    if (result.channelBusy) {
      isPTTPressedRef.current = false;
      setIsPTTPressed(false);
      pttSessionTargetIdsRef.current = null;
      playBusyTone();
      toast.error("Channel busy");
      return;
    }

    if (result.startFailed) {
      console.error("PTT start failed:", result.error);
      pttSessionTargetIdsRef.current = null;
      await releasePttSignals([...pttSignalRefs.current]);
      pttSignalRefs.current = [];
      await discardPttRecording(stopRecording, {
        source: "monitor",
        channelId: targetChannelIdRef.current,
        channelIds: targetIds,
        user,
        reason: "PTT startup failed after claim",
      });
      setIsPTTPressed(false);
      toast.error("Could not start broadcast");
      return;
    }

    if (result.micDenied) {
      pttSessionTargetIdsRef.current = null;
      setIsPTTPressed(false);
      toast.error("Microphone access denied");
      return;
    }
  }, [
    isPTTPressed,
    busyChannelIds,
    monitorChannels,
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
        source: "monitor",
        channelId: targetChannelIdRef.current,
        channelIds: broadcastModeRef.current === "multi"
          ? selectedBroadcastIdsRef.current
          : [targetChannelIdRef.current].filter(Boolean),
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
    { surface: "monitor" }
  );

  const showReceiving = (isLiveReceiving || busyChannelIds.size > 0) && !isPTTPressed;
  const primaryLiveChannel = liveBroadcastChannels[0] || null;

  return (
    <div className="min-h-full w-full safe-top">
      {/* Header */}
      <div className="px-4 pt-4 pb-4 border-b border-border sm:px-5 sm:pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between max-sm:pr-12 sm:pr-48">
          <div>
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-bold text-foreground sm:text-xl">Channel Monitor</h1>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tap the speaker icon to mute channels · hold and drag the grip to reorder
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <SetAllProtectionLevel onApply={handleSetAllProtectionLevel} />
          </div>
        </div>
      </div>

      {/* Live activity ticker */}
      <AnimatePresence>
        {(playingId || liveBroadcastChannels.length > 0) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-5 py-2 bg-green-500/10 border-b border-green-500/20 flex items-center gap-2 flex-wrap"
          >
            <motion.div
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 0.5, repeat: Infinity }}
              className="w-2 h-2 bg-green-500 rounded-full shrink-0"
            />
            {playingId ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                <span className="text-xs font-semibold text-green-400">
                  Playing from: {monitorChannels.find(c => c.id === playingChannel)?.name || "Unknown Channel"}
                </span>
              </>
            ) : (
              liveBroadcastChannels.map((channel) => (
                <div key={channel.id} className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: (channel.color || "#f59e0b") + "25" }}
                  >
                    <Radio className="w-3.5 h-3.5" style={{ color: channel.color || "#f59e0b" }} />
                  </div>
                  <span className="text-xs font-semibold text-green-400">
                    Live on {channel.name}
                  </span>
                </div>
              ))
            )}
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
                  className="flex flex-col gap-4 w-full"
                >
                  {orderedChannels.map((channel, index) => (
                    <Draggable key={channel.id} draggableId={channel.id} index={index}>
                      {(dragProvided) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                        >
                          <ChannelMonitorCard
                            channel={channel}
                            messages={channelMessages(channel.id)}
                            onPlayMessage={handlePlayMessage}
                            playingId={playingId}
                            onSetProtectionLevel={handleSetProtectionLevel}
                            onOpenChannel={handleOpenChannelInTalk}
                            userMap={userMap}
                            isMuted={isMuted?.(channel.id)}
                            onToggleMute={toggleMute}
                            isLiveBroadcasting={busyChannelIds.has(channel.id)}
                            dragHandleProps={dragProvided.dragHandleProps}
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
          onModeChange={handleBroadcastModeChange}
          targetChannelId={targetChannelId}
          onTargetChannelChange={handleTargetChannelChange}
          selectedChannelIds={selectedBroadcastIds}
          onSelectedChannelIdsChange={handleSelectedBroadcastIdsChange}
          isPressed={isPTTPressed}
          isReceiving={showReceiving}
          receivingChannel={primaryLiveChannel}
          isChannelBusy={allBroadcastTargetsBusy && !isPTTPressed && !showReceiving}
          isSending={sendMutation.isPending}
          onStart={handlePTTStart}
          onStop={handlePTTStop}
        />
      )}
    </div>
  );
}