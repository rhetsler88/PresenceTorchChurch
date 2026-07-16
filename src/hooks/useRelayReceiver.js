import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/api/client";
import { playAudioTailFromUrl } from "@/lib/audioPlayer";

const IDLE_TIMEOUT_MS = 8000;
const STALL_TIMEOUT_MS = 2500;

/**
 * Subscribes to AudioChunk entities for the active channel and plays
 * incoming broadcast chunks in sequence — giving listeners live audio
 * while the sender is still holding PTT.
 */
export default function useRelayReceiver({ channelId, userId }) {
  const [isReceiving, setIsReceiving] = useState(false);
  const heardBroadcastsRef = useRef(new Set());
  const queuesRef = useRef({});
  const isReceivingRef = useRef(false);
  const idleTimeoutRef = useRef(null);
  const stallTimeoutRef = useRef({});

  const clearReceiving = useCallback(() => {
    Object.values(stallTimeoutRef.current).forEach((timer) => clearTimeout(timer));
    stallTimeoutRef.current = {};
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

  const finishQueue = useCallback((bId) => {
    if (stallTimeoutRef.current[bId]) {
      clearTimeout(stallTimeoutRef.current[bId]);
      delete stallTimeoutRef.current[bId];
    }
    delete queuesRef.current[bId];
    if (Object.keys(queuesRef.current).length === 0) clearReceiving();
  }, [clearReceiving]);

  const playNextRef = useRef(null);

  const scheduleStallRecovery = useCallback((bId) => {
    if (stallTimeoutRef.current[bId]) clearTimeout(stallTimeoutRef.current[bId]);
    stallTimeoutRef.current[bId] = setTimeout(() => {
      const q = queuesRef.current[bId];
      if (!q || q.playing) return;

      const available = Object.keys(q.chunks)
        .map(Number)
        .filter((seq) => seq >= q.nextSeq)
        .sort((a, b) => a - b);

      if (available.length > 0 && available[0] > q.nextSeq) {
        q.nextSeq = available[0];
      } else if (q.finalReceived && q.nextSeq > q.finalSeq) {
        finishQueue(bId);
        return;
      }

      playNextRef.current?.(bId);
    }, STALL_TIMEOUT_MS);
  }, [finishQueue]);

  const playNext = useCallback((bId) => {
    const q = queuesRef.current[bId];
    if (!q || q.playing) return;

    const url = q.chunks[q.nextSeq];
    if (!url) {
      if (q.finalReceived && q.nextSeq > q.finalSeq) {
        finishQueue(bId);
        return;
      }
      scheduleStallRecovery(bId);
      return;
    }

    if (stallTimeoutRef.current[bId]) {
      clearTimeout(stallTimeoutRef.current[bId]);
      delete stallTimeoutRef.current[bId];
    }

    q.playing = true;
    const startAt = q.playedDuration || 0;

    const advance = () => {
      if (!queuesRef.current[bId]) return;
      const queue = queuesRef.current[bId];
      queue.playing = false;
      delete queue.chunks[queue.nextSeq];
      queue.nextSeq += 1;

      if (queue.finalReceived && queue.nextSeq > queue.finalSeq) {
        finishQueue(bId);
        return;
      }
      playNext(bId);
    };

    playAudioTailFromUrl(url, startAt, { onEnded: advance, onError: advance })
      .then(({ totalDuration }) => {
        if (queuesRef.current[bId] && totalDuration != null) {
          queuesRef.current[bId].playedDuration = totalDuration;
        }
      })
      .catch(advance);
  }, [finishQueue, scheduleStallRecovery]);

  playNextRef.current = playNext;

  useEffect(() => {
    if (!channelId || !userId) return;

    const unsub = api.entities.AudioChunk.subscribe((event) => {
      if (event.type !== "create") return;
      if (event.data?.channel_id !== channelId) return;
      if (event.data?.sender_id === userId) return;

      const chunk = event.data;
      const bId = chunk.broadcast_id;
      if (!bId || !chunk.audio_url) return;

      heardBroadcastsRef.current.add(bId);

      if (!queuesRef.current[bId]) {
        queuesRef.current[bId] = {
          nextSeq: 0,
          chunks: {},
          finalReceived: false,
          finalSeq: null,
          playing: false,
          playedDuration: 0,
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
  }, [channelId, userId, playNext, resetIdleTimer, clearReceiving]);

  return { isReceiving, heardBroadcastsRef };
}
