import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/api/client";

const IDLE_TIMEOUT_MS = 15000; // Clear receiving after 15s of no new chunks

/**
 * Subscribes to AudioChunk entities for the active channel and plays
 * incoming broadcast chunks in sequence — giving listeners live audio
 * while the sender is still holding PTT.
 *
 * Tracks which broadcast_ids were heard live so Talk.jsx can skip
 * auto-playing the stored VoiceMessage for broadcasts already heard.
 */
export default function useRelayReceiver({ channelId, userId }) {
  const [isReceiving, setIsReceiving] = useState(false);
  const heardBroadcastsRef = useRef(new Set());
  const queuesRef = useRef({});
  const isReceivingRef = useRef(false);
  const idleTimeoutRef = useRef(null);

  const clearReceiving = useCallback(() => {
    Object.values(queuesRef.current).forEach((q) => {
      if (q.currentAudio) { q.currentAudio.pause(); q.currentAudio = null; }
    });
    queuesRef.current = {};
    isReceivingRef.current = false;
    setIsReceiving(false);
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    idleTimeoutRef.current = setTimeout(clearReceiving, IDLE_TIMEOUT_MS);
  }, [clearReceiving]);

  const playNext = useCallback((bId) => {
    const q = queuesRef.current[bId];
    if (!q || q.currentAudio) return;

    const url = q.chunks[q.nextSeq];
    if (!url) {
      // No more chunks to play right now.
      // If final was received and all played, clean up.
      if (q.finalReceived && q.nextSeq > q.finalSeq) {
        delete queuesRef.current[bId];
        if (Object.keys(queuesRef.current).length === 0) clearReceiving();
      }
      // Otherwise, waiting for more chunks — idle timer will eventually clear
      return;
    }

    const audio = new Audio(url);
    q.currentAudio = audio;

    const advance = () => {
      q.currentAudio = null;
      delete q.chunks[q.nextSeq];
      q.nextSeq++;
      if (q.finalReceived && q.nextSeq > q.finalSeq) {
        delete queuesRef.current[bId];
        if (Object.keys(queuesRef.current).length === 0) clearReceiving();
      } else {
        playNext(bId);
      }
    };

    audio.onended = advance;
    audio.onerror = advance;
    audio.play().catch(advance);
  }, [clearReceiving]);

  useEffect(() => {
    if (!channelId || !userId) return;

    const unsub = api.entities.AudioChunk.subscribe((event) => {
      if (event.type !== "create") return;
      if (event.data?.channel_id !== channelId) return;
      if (event.data?.sender_id === userId) return;

      const chunk = event.data;
      const bId = chunk.broadcast_id;
      if (!bId) return;

      heardBroadcastsRef.current.add(bId);

      if (!queuesRef.current[bId]) {
        queuesRef.current[bId] = {
          nextSeq: 0,
          chunks: {},
          finalReceived: false,
          finalSeq: null,
          currentAudio: null,
        };
      }

      const q = queuesRef.current[bId];
      q.chunks[chunk.sequence] = chunk.audio_url;

      if (chunk.is_final) {
        q.finalReceived = true;
        q.finalSeq = chunk.sequence;
      }

      // Reset idle timer on every chunk — stays alive while broadcast is active,
      // clears quickly once chunks stop arriving
      if (!isReceivingRef.current) {
        isReceivingRef.current = true;
        setIsReceiving(true);
      }
      resetIdleTimer();
      playNext(bId);
    });

    return () => {
      unsub();
      clearReceiving();
    };
  }, [channelId, userId, playNext, resetIdleTimer, clearReceiving]);

  return { isReceiving, heardBroadcastsRef };
}