import React, { useState, useRef, useCallback, useEffect } from "react";
import { Mic } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { unlockAudioForPTT } from "@/lib/pttTones";

export default function PTTButton({ isPressed, isRecording, isConnected, isReceiving, isChannelBusy, onStart, onStop }) {
  const [duration, setDuration] = useState(0);
  const [isHeld, setIsHeld] = useState(false);
  const timerRef = useRef(null);
  const buttonRef = useRef(null);

  const showPressed = isHeld || isPressed || isRecording;

  useEffect(() => {
    if (showPressed) {
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 0.1), 100);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [showPressed]);

  const handlePointerDown = useCallback((e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    unlockAudioForPTT();
    setIsHeld(true);
    buttonRef.current?.setPointerCapture?.(e.pointerId);
    onStart?.();
  }, [onStart]);

  const handlePointerUp = useCallback((e) => {
    e.preventDefault();
    if (!isHeld) return;
    setIsHeld(false);
    if (buttonRef.current?.hasPointerCapture?.(e.pointerId)) {
      buttonRef.current.releasePointerCapture(e.pointerId);
    }
    onStop?.();
  }, [isHeld, onStop]);

  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <AnimatePresence>
        {showPressed && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full"
          >
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm font-mono font-semibold text-primary">
              {formatTime(duration)}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative">
        <AnimatePresence>
          {showPressed && (
            <>
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  initial={{ scale: 1, opacity: 0.4 }}
                  animate={{ scale: 2.5, opacity: 0 }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.5 }}
                  className="absolute inset-0 rounded-full bg-primary/20"
                />
              ))}
            </>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isReceiving && (
            <>
              {[0, 1].map(i => (
                <motion.div
                  key={`recv-${i}`}
                  initial={{ scale: 1, opacity: 0.3 }}
                  animate={{ scale: 2, opacity: 0 }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.4 }}
                  className="absolute inset-0 rounded-full bg-green-500/20"
                />
              ))}
            </>
          )}
        </AnimatePresence>

        <motion.button
          ref={buttonRef}
          type="button"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          whileTap={{ scale: 0.95 }}
          className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 select-none touch-none shadow-2xl ${
            showPressed
              ? "bg-primary text-primary-foreground shadow-primary/40"
              : isReceiving
              ? "bg-green-600 text-white shadow-green-600/30"
              : isChannelBusy
              ? "bg-amber-600/90 text-white shadow-amber-600/30"
              : isConnected
              ? "bg-card border-2 border-border text-foreground hover:border-primary/50"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
          disabled={!isConnected && !showPressed}
        >
          <Mic className={`w-9 h-9 ${showPressed ? "animate-pulse" : ""}`} />
        </motion.button>
      </div>

      <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">
        {showPressed
          ? "Release to send"
          : isReceiving
          ? "Receiving..."
          : isChannelBusy
          ? "Channel busy"
          : isConnected
          ? "Hold to talk"
          : "Join a channel"}
      </p>
    </div>
  );
}
