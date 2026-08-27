import React, { useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, FileText, Radio, Check, MessageSquare, Circle, Shield } from "lucide-react";
import { etzTime } from "@/lib/etz";
import { deviceDayKey, deviceDayLabel } from "@/lib/deviceDate";
import { Button } from "@/components/ui/button";
import { PROTECTION_LEVELS } from "@/components/ptt/ProtectionLevelBadge";
import { isProtectionLevelChangeMessage } from "@/lib/protectionLevelHistory";
import { getInitialsFromName } from "@/lib/userUtils";
import SpeakerVolumeControl from "@/components/ptt/SpeakerVolumeControl";

function ProtectionLevelLineEntry({ message }) {
  const level = message.protection_level || "green";
  const config = PROTECTION_LEVELS[level] || PROTECTION_LEVELS.green;
  const msgDayKey = message.device_date || deviceDayKey(message.created_date);
  const showDateStamp = msgDayKey !== deviceDayKey();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="py-1"
    >
      {showDateStamp && (
        <span className="block text-center text-[9px] text-muted-foreground/70 font-semibold uppercase tracking-wider mb-1">
          {deviceDayLabel(msgDayKey)}
        </span>
      )}
      <div className="flex items-center gap-2 px-2">
        <div className="h-px flex-1 bg-border" />
        <div
          className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 max-w-[90%]"
          style={{ backgroundColor: config.bg, borderColor: `${config.color}40` }}
        >
          <Shield className="w-3 h-3 flex-shrink-0" style={{ color: config.color }} />
          <span className="text-[10px] font-medium leading-snug" style={{ color: config.color }}>
            {message.text_content}
          </span>
          <span className="text-[9px] text-muted-foreground flex-shrink-0">
            · {message.device_time || etzTime(message.created_date)}
          </span>
        </div>
        <div className="h-px flex-1 bg-border" />
      </div>
    </motion.div>
  );
}

function MessageItem({
  message,
  currentUser,
  onPlay,
  isPlaying,
  canDelete,
  selectionMode,
  isSelected,
  onToggleSelect,
  onEnterSelection,
}) {
  const isMine = message.created_by_id === currentUser?.id;
  const initials = getInitialsFromName(message.sender_name);
  const longPressTimer = useRef(null);
  const longPressTriggered = useRef(false);
  const isTextOnly = !!message.text_content;
  const msgDayKey = message.device_date || deviceDayKey(message.created_date);
  const showDateStamp = msgDayKey !== deviceDayKey();

  const barHeights = useMemo(() => {
    let seed = (message.id || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    return Array.from({ length: 12 }, () => 8 + Math.floor(rand() * 12));
  }, [message.id]);

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const startLongPress = () => {
    if (!canDelete || selectionMode) return;
    longPressTriggered.current = false;
    clearLongPressTimer();
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      onEnterSelection(message.id);
    }, 750);
  };

  const endLongPress = () => {
    clearLongPressTimer();
  };

  const handleBubbleClick = () => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (selectionMode) {
      onToggleSelect(message.id);
      return;
    }
    if (!isTextOnly && message.audio_url) {
      onPlay?.(message);
    }
  };

  const handlePlayClick = (event) => {
    event.stopPropagation();
    handleBubbleClick();
  };

  const bubbleClasses = `rounded-2xl px-4 py-3 transition-all select-none ${
    isMine ? "bg-primary text-primary-foreground" : "bg-card border border-border"
  } ${selectionMode && isSelected ? "ring-2 ring-destructive" : ""} ${
    selectionMode || (!isTextOnly && message.audio_url) ? "cursor-pointer" : ""
  }`;

  const selectionIndicator = (
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        isSelected ? "bg-destructive text-white" : "bg-muted text-muted-foreground"
      }`}
    >
      {isSelected ? <Check className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
    </div>
  );

  const playControl = selectionMode ? (
    selectionIndicator
  ) : message.audio_url ? (
    <Button
      size="icon"
      variant="ghost"
      className={`w-8 h-8 rounded-full ${
        isMine ? "hover:bg-white/20 text-primary-foreground" : "hover:bg-muted"
      }`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={handlePlayClick}
    >
      {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
    </Button>
  ) : (
    <div className="w-8 h-8 rounded-full flex items-center justify-center opacity-40">
      <Play className="w-3.5 h-3.5" />
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex gap-3 ${isMine ? "flex-row-reverse" : ""}`}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        selectionMode && isSelected ? "bg-destructive" : "bg-primary/10"
      }`}>
        {selectionMode && isSelected ? (
          <Check className="w-4 h-4 text-white" />
        ) : (
          <span className="text-[10px] font-bold text-primary">{initials}</span>
        )}
      </div>
      <div className={`flex flex-col ${isMine ? "items-end" : "items-start"} max-w-[75%]`}>
        {showDateStamp && (
          <span className="text-[9px] text-muted-foreground/70 font-semibold uppercase tracking-wider mb-0.5 px-1">
            {deviceDayLabel(msgDayKey)}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground font-medium mb-1 px-1">
          {message.sender_name} · {message.device_time || etzTime(message.created_date)}
        </span>
        {isTextOnly ? (
          <div
            className={bubbleClasses}
            onPointerDown={startLongPress}
            onPointerUp={endLongPress}
            onPointerLeave={endLongPress}
            onPointerCancel={endLongPress}
            onClick={handleBubbleClick}
          >
            <div className="flex items-center gap-1.5 mb-1 opacity-60">
              <MessageSquare className="w-3 h-3" />
              <span className="text-[10px] font-medium">Text</span>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.text_content}</p>
          </div>
        ) : (
          <div
            className={bubbleClasses}
            onPointerDown={startLongPress}
            onPointerUp={endLongPress}
            onPointerLeave={endLongPress}
            onPointerCancel={endLongPress}
            onClick={handleBubbleClick}
          >
            <div className="flex items-center gap-3">
              {playControl}
              {!isMine && message.created_by_id && (
                <SpeakerVolumeControl
                  userId={message.created_by_id}
                  displayName={message.sender_name}
                  compact
                />
              )}
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5 items-center" style={{ height: "20px" }}>
                    {barHeights.map((h, i) => (
                      <div
                        key={i}
                        className={`w-0.5 rounded-full ${
                          isMine ? "bg-primary-foreground/40" : "bg-foreground/20"
                        }`}
                        style={{
                          height: `${h}px`,
                          animation: isPlaying && !selectionMode
                            ? `ptt-bar-pulse 0.8s ease-in-out ${i * 0.06}s infinite`
                            : "none",
                        }}
                      />
                    ))}
                  </div>
                </div>
                <span className={`text-[10px] mt-0.5 ${
                  isMine ? "text-primary-foreground/60" : "text-muted-foreground"
                }`}>
                  {message.duration_seconds ? `${Math.round(message.duration_seconds)}s` : "voice"}
                </span>
              </div>
            </div>
            {message.transcript && (
              <div className={`mt-2 pt-2 border-t ${
                isMine ? "border-white/20" : "border-border"
              }`}>
                <div className="flex items-center gap-1 mb-1">
                  <FileText className="w-3 h-3 opacity-50" />
                  <span className={`text-[10px] font-medium opacity-50`}>Transcript</span>
                </div>
                <p className={`text-xs leading-relaxed ${
                  isMine ? "text-primary-foreground/80" : "text-muted-foreground"
                }`}>
                  {message.transcript}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function MessageFeed({
  messages,
  currentUser,
  onPlayMessage,
  playingId,
  canDelete,
  selectionMode,
  selectedIds,
  onToggleSelect,
  onEnterSelection,
}) {
  return (
    <div className="flex flex-col gap-4 px-4 py-3">
      <AnimatePresence initial={false}>
        {messages.map(msg => (
          isProtectionLevelChangeMessage(msg) ? (
            <ProtectionLevelLineEntry key={msg.id} message={msg} />
          ) : (
            <MessageItem
              key={msg.id}
              message={msg}
              currentUser={currentUser}
              onPlay={onPlayMessage}
              isPlaying={playingId === msg.id}
              canDelete={canDelete}
              selectionMode={selectionMode}
              isSelected={selectedIds?.has(msg.id)}
              onToggleSelect={onToggleSelect}
              onEnterSelection={onEnterSelection}
            />
          )
        ))}
      </AnimatePresence>
      {messages.length === 0 && (
        <div className="text-center py-16">
          <Radio className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No messages yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Hold the talk button to send</p>
        </div>
      )}
    </div>
  );
}
