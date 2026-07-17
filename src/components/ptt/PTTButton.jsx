import React, { useState, useRef, useCallback, useEffect } from "react";
import { Mic } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function PTTButton({ isPressed, isConnected, isReceiving, isChannelBusy, onStart, onStop }) {
  const [duration, setDuration] = useState(0);
  const timerRef = useRef(null);
  const pointerDownRef = useRef(false);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (isPressed) {
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 0.1), 100);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isPressed]);

  const handlePointerDown = useCallback((e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    pointerDownRef.current = true;
    buttonRef.current?.setPointerCapture?.(e.pointerId);
    onStart?.();
  }, [onStart]);

  const handlePointerUp = useCallback((e) => {
    e.preventDefault();
    if (!pointerDownRef.current) return;
    pointerDownRef.current = false;
    if (buttonRef.current?.hasPointerCapture?.(e.pointerId)) {
      buttonRef.current.releasePointerCapture(e.pointerId);
    }
    onStop?.();
  }, [onStop]);

  const handlePointerCancel = useCallback((e) => {
    if (!pointerDownRef.current) return;
    pointerDownRef.current = false;
    onStop?.();
  }, [onStop]);

  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <AnimatePresence>
        {isPressed && (
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
          {isPressed && (
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
          onPointerCancel={handlePointerCancel}
          onLostPointerCapture={handlePointerCancel}
          whileTap={{ scale: 0.95 }}
          className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 select-none touch-none shadow-2xl ${
            isPressed
              ? "bg-primary text-primary-foreground shadow-primary/40"
              : isReceiving
              ? "bg-green-600 text-white shadow-green-600/30"
              : isChannelBusy
              ? "bg-amber-600/90 text-white shadow-amber-600/30"
              : isConnected
              ? "bg-card border-2 border-border text-foreground hover:border-primary/50"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
          disabled={!isConnected}
        >
          <Mic className={`w-9 h-9 ${isPressed ? "animate-pulse" : ""}`} />
        </motion.button>
      </div>

      <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">
        {isPressed
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
