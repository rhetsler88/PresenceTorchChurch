import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Megaphone, ChevronDown, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

export default function MonitorPTTBar(props) {
  const {
    channels,
    mode,
    onModeChange,
    targetChannelId,
    onTargetChannelChange,
    selectedChannelIds,
    onSelectedChannelIdsChange,
    isPressed,
    isReceiving,
    isChannelBusy,
    isSending,
    onStart,
    onStop,
  } = props;
  const [duration, setDuration] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (isPressed) {
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 0.1), 100);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isPressed]);

  const targetChannel = channels.find(c => c.id === targetChannelId);
  const selectedSet = new Set(selectedChannelIds);
  const selectedCount = channels.filter(c => selectedSet.has(c.id)).length;
  const allSelected = channels.length > 0 && selectedCount === channels.length;
  const isMulti = mode === "multi";

  const handleStart = useCallback((e) => {
    e.preventDefault();
    onStart?.();
  }, [onStart]);

  const handleEnd = useCallback((e) => {
    e.preventDefault();
    if (!isPressed) return;
    onStop?.();
  }, [isPressed, onStop]);

  const toggleChannel = useCallback((channelId, checked) => {
    if (checked) {
      onSelectedChannelIdsChange([...new Set([...selectedChannelIds, channelId])]);
    } else {
      onSelectedChannelIdsChange(selectedChannelIds.filter(id => id !== channelId));
    }
  }, [onSelectedChannelIdsChange, selectedChannelIds]);

  const selectAll = useCallback(() => {
    onSelectedChannelIdsChange(channels.map(c => c.id));
  }, [channels, onSelectedChannelIdsChange]);

  const fmtTime = (s) => {
    return Math.floor(s / 60) + ":" + Math.floor(s % 60).toString().padStart(2, "0");
  };

  const selectedLabel = isMulti
    ? selectedCount === channels.length
      ? "all channels"
      : `${selectedCount} channel${selectedCount === 1 ? "" : "s"}`
    : targetChannel?.name || "";

  const statusText = isSending
    ? "Sending..."
    : isPressed
      ? (isMulti
          ? `Broadcasting to ${selectedLabel} — release to send`
          : `Sending to ${selectedLabel} — release to send`)
      : isReceiving
        ? "Receiving..."
        : isChannelBusy
          ? "Channel busy"
          : isMulti
            ? selectedCount === 0
              ? "Select at least one channel"
              : `Hold to broadcast to ${selectedLabel}`
            : `Hold to reply in ${targetChannel?.name || "..."}`;

  const canPTT = isMulti ? selectedCount > 0 : Boolean(targetChannelId);
  const useMegaphone = isMulti && selectedCount !== 1;

  return (
    <div className="fixed left-0 right-0 bg-card/95 backdrop-blur border-t border-border px-4 py-3 z-40" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 4rem)' }}>
      <div className="max-w-2xl mx-auto flex items-center gap-3">

        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Respond to</p>

          <div className="flex items-center gap-1.5 mb-1.5">
            <button
              type="button"
              onClick={() => onModeChange("single")}
              className={"px-2 py-1 rounded-md border text-[10px] font-semibold transition-all " + (mode === "single" ? "bg-primary/10 border-primary/40 text-primary" : "bg-muted border-border text-muted-foreground")}
            >
              Single
            </button>
            <button
              type="button"
              onClick={() => onModeChange("multi")}
              className={"px-2 py-1 rounded-md border text-[10px] font-semibold transition-all " + (mode === "multi" ? "bg-red-500/10 border-red-500/40 text-red-400" : "bg-muted border-border text-muted-foreground")}
            >
              Broadcast
            </button>
          </div>

          {isMulti ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                disabled={allSelected}
                className={"flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all " + (allSelected ? "bg-red-500/10 border-red-500/40 text-red-400" : "bg-muted border-border text-muted-foreground hover:text-foreground")}
              >
                <Megaphone className="w-3.5 h-3.5" />
                All
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all text-left bg-muted border-border hover:border-primary/40 hover:text-foreground"
                  >
                    <span className="truncate text-foreground">
                      {selectedCount === 0
                        ? "Select channels"
                        : allSelected
                          ? "All channels selected"
                          : `${selectedCount} of ${channels.length} channels`}
                    </span>
                    <ChevronDown className="w-3 h-3 ml-auto flex-shrink-0 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 max-h-64 overflow-y-auto">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Channels for this broadcast
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {channels.map(ch => (
                    <DropdownMenuCheckboxItem
                      key={ch.id}
                      checked={selectedSet.has(ch.id)}
                      onCheckedChange={(checked) => toggleChannel(ch.id, checked)}
                      onSelect={(e) => e.preventDefault()}
                      className="flex items-center gap-2"
                    >
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: ch.color || "#f59e0b" }} />
                      <span className="flex-1">{ch.name}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all text-left bg-muted border-border hover:border-primary/40 hover:text-foreground"
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: targetChannel?.color || "#f59e0b" }}
                  />
                  <span className="truncate text-foreground">
                    {targetChannel?.name || "Select channel"}
                  </span>
                  <ChevronDown className="w-3 h-3 ml-auto flex-shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                {channels.map(ch => (
                  <DropdownMenuItem
                    key={ch.id}
                    onClick={() => onTargetChannelChange(ch.id)}
                    className="flex items-center gap-2"
                  >
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ch.color || "#f59e0b" }} />
                    <span className="flex-1">{ch.name}</span>
                    {ch.id === targetChannelId && <Check className="w-3.5 h-3.5 text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <AnimatePresence>
          {isPressed && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex items-center gap-1.5 px-2 py-1 bg-red-500/10 rounded-lg"
            >
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              <span className="text-xs font-mono font-bold text-red-400">{fmtTime(duration)}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative">
          <AnimatePresence>
            {isPressed && [0, 1].map(i => (
              <motion.div
                key={i}
                initial={{ scale: 1, opacity: 0.4 }}
                animate={{ scale: 2.2, opacity: 0 }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.4 }}
                className={"absolute inset-0 rounded-full " + (useMegaphone ? "bg-red-500/20" : "bg-primary/20")}
              />
            ))}
          </AnimatePresence>
          <AnimatePresence>
            {isReceiving && !isPressed && [0, 1].map(i => (
              <motion.div
                key={"recv-" + i}
                initial={{ scale: 1, opacity: 0.3 }}
                animate={{ scale: 2, opacity: 0 }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.4 }}
                className="absolute inset-0 rounded-full bg-green-500/20"
              />
            ))}
          </AnimatePresence>
          <motion.button
            onMouseDown={handleStart}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
            onTouchStart={handleStart}
            onTouchEnd={handleEnd}
            onTouchCancel={handleEnd}
            whileTap={{ scale: 0.92 }}
            disabled={isSending || !canPTT}
            className={"relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 select-none touch-none shadow-lg " + (isPressed ? (useMegaphone ? "bg-red-500 text-white shadow-red-500/40" : "bg-primary text-primary-foreground shadow-primary/40") : isReceiving ? "bg-green-600 text-white shadow-green-600/30" : "bg-card border-2 border-border text-foreground hover:border-primary/50 disabled:opacity-40")}
          >
            {useMegaphone
              ? <Megaphone className={"w-6 h-6 " + (isPressed ? "animate-pulse" : "")} />
              : <Mic className={"w-6 h-6 " + (isPressed ? "animate-pulse" : "")} />
            }
          </motion.button>
        </div>
      </div>

      <p className="text-center text-[10px] text-muted-foreground mt-2 uppercase tracking-widest">
        {statusText}
      </p>
    </div>
  );
}
