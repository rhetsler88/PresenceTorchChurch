import React, { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Clock, User, Radio, FileText, MessageSquare, Shield, Check, Circle } from "lucide-react";
import { etzTime } from "@/lib/etz";
import { PROTECTION_LEVELS } from "@/components/ptt/ProtectionLevelBadge";
import { isProtectionLevelChangeMessage } from "@/lib/protectionLevelHistory";

export default function TranscriptItem({
  msg,
  channel,
  senderName,
  canDelete = false,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  onEnterSelection,
}) {
  const longPressTimer = useRef(null);
  const longPressTriggered = useRef(false);

  if (isProtectionLevelChangeMessage(msg)) {
    const level = msg.protection_level || "green";
    const config = PROTECTION_LEVELS[level] || PROTECTION_LEVELS.green;

    return (
      <div
        className="w-full rounded-xl border px-4 py-3"
        style={{ backgroundColor: config.bg, borderColor: `${config.color}40` }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="w-4 h-4 flex-shrink-0" style={{ color: config.color }} />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-snug" style={{ color: config.color }}>
                {msg.text_content}
              </p>
              {channel && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Radio className="w-2.5 h-2.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">{channel.name}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground flex-shrink-0">
            <Clock className="w-3 h-3" />
            <span className="text-[10px]">
              {msg.device_time || etzTime(msg.created_date)}
            </span>
          </div>
        </div>
      </div>
    );
  }

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
      onEnterSelection?.(msg.id);
    }, 750);
  };

  const endLongPress = () => {
    clearLongPressTimer();
  };

  const handleClick = () => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (selectionMode) {
      onToggleSelect?.(msg.id);
    }
  };

  return (
    <div
      className={`w-full bg-card border border-border rounded-xl p-4 transition-all select-none ${
        selectionMode ? "cursor-pointer" : ""
      } ${selectionMode && isSelected ? "ring-2 ring-destructive" : ""}`}
      onPointerDown={startLongPress}
      onPointerUp={endLongPress}
      onPointerLeave={endLongPress}
      onPointerCancel={endLongPress}
      onClick={handleClick}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
            selectionMode && isSelected ? "bg-destructive" : "bg-primary/10"
          }`}>
            {selectionMode && isSelected ? (
              <Check className="w-3.5 h-3.5 text-white" />
            ) : (
              <User className="w-3.5 h-3.5 text-primary" />
            )}
          </div>
          <div>
            <span className="text-sm font-semibold text-foreground">
              {senderName || msg.sender_name}
            </span>
            {channel && (
              <div className="flex items-center gap-1 mt-0.5">
                <Radio className="w-2.5 h-2.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">{channel.name}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {selectionMode && (
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
              isSelected ? "bg-destructive text-white" : "bg-muted text-muted-foreground"
            }`}>
              {isSelected ? <Check className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
            </div>
          )}
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span className="text-[10px]">
              {msg.device_time || etzTime(msg.created_date)}
            </span>
          </div>
        </div>
      </div>
      <p className="text-sm text-foreground/80 leading-relaxed pl-9 italic">
        {msg.text_content || msg.transcript || (msg.audio_url ? "No transcript" : "—")}
      </p>
      <div className="flex items-center gap-2 mt-2 pl-9">
        <Badge variant="secondary" className="text-[10px]">
          {msg.text_content ? (
            <>
              <MessageSquare className="w-2.5 h-2.5 mr-1" />
              text
            </>
          ) : (
            <>
              <FileText className="w-2.5 h-2.5 mr-1" />
              {msg.duration_seconds ? `${Math.round(msg.duration_seconds)}s` : "voice"}
            </>
          )}
        </Badge>
      </div>
    </div>
  );
}