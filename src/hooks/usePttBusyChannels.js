import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/api/client";
import {
  cleanupStalePTTSignals,
  PTT_SIGNAL_TTL_MS,
} from "@/lib/pttSignals";

/**
 * Tracks channels with an active remote PTT signal (Firestore claim).
 * Single source of truth for half-duplex busy state across Talk, Monitor, and global PTT.
 */
export default function usePttBusyChannels({
  channelIds = [],
  userId = null,
  enabled = true,
}) {
  const [busyChannelIds, setBusyChannelIds] = useState(() => new Set());
  const timeoutRef = useRef(new Map());
  const channelKey = useMemo(
    () => [...new Set(channelIds.filter(Boolean))].sort().join(","),
    [channelIds]
  );
  const watchedIds = useMemo(
    () => (channelKey ? channelKey.split(",") : []),
    [channelKey]
  );

  const clearChannelTimeout = useCallback((channelId) => {
    const timer = timeoutRef.current.get(channelId);
    if (timer) {
      clearTimeout(timer);
      timeoutRef.current.delete(channelId);
    }
  }, []);

  const markBusy = useCallback((channelId) => {
    if (!channelId) return;
    setBusyChannelIds((prev) => {
      if (prev.has(channelId)) return prev;
      const next = new Set(prev);
      next.add(channelId);
      return next;
    });
    clearChannelTimeout(channelId);
    timeoutRef.current.set(
      channelId,
      setTimeout(() => {
        timeoutRef.current.delete(channelId);
        setBusyChannelIds((prev) => {
          if (!prev.has(channelId)) return prev;
          const next = new Set(prev);
          next.delete(channelId);
          return next;
        });
      }, PTT_SIGNAL_TTL_MS)
    );
  }, [clearChannelTimeout]);

  const markIdle = useCallback((channelId) => {
    if (!channelId) return;
    clearChannelTimeout(channelId);
    setBusyChannelIds((prev) => {
      if (!prev.has(channelId)) return prev;
      const next = new Set(prev);
      next.delete(channelId);
      return next;
    });
  }, [clearChannelTimeout]);

  useEffect(() => {
    if (!enabled || !userId || watchedIds.length === 0) {
      setBusyChannelIds(new Set());
      return undefined;
    }

    let cancelled = false;

    cleanupStalePTTSignals({
      channelIds: watchedIds,
      excludeSenderId: userId,
    })
      .then((active) => {
        if (cancelled || active.length === 0) return;
        for (const signal of active) {
          if (signal.channel_id) markBusy(signal.channel_id);
        }
      })
      .catch(() => {});

    const handleEvent = (event) => {
      if (event.data?.sender_id === userId) return;
      const channelId = event.data?.channel_id;
      if (!channelId || !watchedIds.includes(channelId)) return;

      if (event.type === "create") {
        markBusy(channelId);
      } else if (event.type === "delete") {
        markIdle(channelId);
      }
    };

    const unsub = watchedIds.length === 1
      ? api.entities.PTTSignal.subscribe(handleEvent, { channel_id: watchedIds[0] })
      : api.entities.PTTSignal.subscribeMany(
        handleEvent,
        watchedIds.map((channelId) => ({ channel_id: channelId }))
      );

    return () => {
      cancelled = true;
      unsub();
      for (const timer of timeoutRef.current.values()) {
        clearTimeout(timer);
      }
      timeoutRef.current.clear();
    };
  }, [enabled, userId, channelKey, watchedIds, markBusy, markIdle]);

  const isChannelBusy = useCallback(
    (channelId) => Boolean(channelId && busyChannelIds.has(channelId)),
    [busyChannelIds]
  );

  const isAnyChannelBusy = useCallback(
    (ids = []) => ids.some((id) => busyChannelIds.has(id)),
    [busyChannelIds]
  );

  return {
    busyChannelIds,
    isChannelBusy,
    isAnyChannelBusy,
  };
}
