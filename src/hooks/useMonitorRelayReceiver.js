import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/api/client";

const IDLE_TIMEOUT_MS = 15000;

/**
 * Multi-channel relay receiver for the Monitor page.
 * Subscribes to AudioChunk entities across ALL channels and plays
 * incoming broadcast chunks in sequence — giving the monitor live audio
 * while senders are still holding PTT.
 */
export default function useMonitorRelayReceiver({ userId, channelIds }) {
  const [isReceiving, setIsReceiving] = useState(false);
  const heardBroadcastsRef = useRef(new Set());
  const queuesRef = useRef({});
  const isReceivingRef = useRef(false);
  const idleTimeoutRef = useRef(null);
  const channelIdsRef = useRef(new Set(channelIds));
  channelIdsRef.current = new Set(channelIds);

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
      if (q.finalReceived && q.nextSeq > q.finalSeq) {
        delete queuesRef.current[bId];
        if (Object.keys(queuesRef.current).length === 0) clearReceiving();
      }
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
    if (!userId) return;

    const unsub = api.entities.AudioChunk.subscribe((event) => {
      if (event.type !== "create") return;
      if (!channelIdsRef.current.has(event.data?.channel_id)) return;
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
  }, [userId, playNext, resetIdleTimer, clearReceiving]);

  return { isReceiving, heardBroadcastsRef };
}