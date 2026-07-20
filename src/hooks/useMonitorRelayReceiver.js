import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/api/client";
import { playRelayAudioTail, stopRelayAudio } from "@/lib/audioPlayer";

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
    stopRelayAudio();
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
    if (!q || q.playing) return;

    const url = q.chunks[q.nextSeq];
    if (!url) {
      if (q.finalReceived && q.nextSeq > q.finalSeq) {
        delete queuesRef.current[bId];
        if (Object.keys(queuesRef.current).length === 0) clearReceiving();
      }
      return;
    }

    q.playing = true;
    const startSeconds = q.playedDuration || 0;

    const advanceAfterPlay = () => {
      if (!queuesRef.current[bId]) return;
      const queue = queuesRef.current[bId];
      queue.playing = false;
      delete queue.chunks[queue.nextSeq];
      queue.nextSeq += 1;
      if (queue.finalReceived && queue.nextSeq > queue.finalSeq) {
        delete queuesRef.current[bId];
        if (Object.keys(queuesRef.current).length === 0) clearReceiving();
      } else {
        playNext(bId);
      }
    };

    playRelayAudioTail(url, startSeconds)
      .then(({ totalDuration }) => {
        if (!queuesRef.current[bId]) return;
        if (totalDuration != null) {
          queuesRef.current[bId].playedDuration = totalDuration;
        }
        advanceAfterPlay();
      })
      .catch(advanceAfterPlay);
  }, [clearReceiving]);

  useEffect(() => {
    if (!userId || channelIds.length === 0) return;

    const unsub = api.entities.AudioChunk.subscribeMany(
      (event) => {
        if (event.type !== "create") return;
        if (!channelIdsRef.current.has(event.data?.channel_id)) return;
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
      },
      channelIds.map((channelId) => ({ channel_id: channelId }))
    );

    return () => {
      unsub();
      clearReceiving();
    };
  }, [userId, channelIds, playNext, resetIdleTimer, clearReceiving]);

  return { isReceiving, heardBroadcastsRef };
}
