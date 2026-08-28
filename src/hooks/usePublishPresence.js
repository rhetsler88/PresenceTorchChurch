import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import {
  clearPresence,
  publishPresence,
  PRESENCE_HEARTBEAT_MS,
} from "@/lib/presence";

function isAppForeground() {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

function channelIdsKey(channelIds) {
  return [...new Set((channelIds || []).filter(Boolean))].sort().join(",");
}

/**
 * Publishes channel presence while enabled: immediate on channel/foreground change,
 * then every 15 minutes. Clears on background or unmount.
 */
export default function usePublishPresence({ channelIds = [], displayName, enabled }) {
  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;
  const channelIdsRef = useRef(channelIds);
  channelIdsRef.current = channelIds;

  const channelKey = channelIdsKey(channelIds);

  useEffect(() => {
    if (!enabled || !channelKey) return undefined;

    let cancelled = false;
    let heartbeatId = null;

    const touch = () => {
      if (cancelled || !isAppForeground()) return;
      void publishPresence({
        channelIds: channelIdsRef.current,
        displayName: displayNameRef.current,
      }).catch(() => {});
    };

    const clearHeartbeat = () => {
      if (heartbeatId != null) {
        clearInterval(heartbeatId);
        heartbeatId = null;
      }
    };

    const startHeartbeat = () => {
      clearHeartbeat();
      heartbeatId = setInterval(touch, PRESENCE_HEARTBEAT_MS);
    };

    const handleBackground = () => {
      clearHeartbeat();
      void clearPresence().catch(() => {});
    };

    const handleForeground = () => {
      touch();
      startHeartbeat();
    };

    if (isAppForeground()) {
      touch();
      startHeartbeat();
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        handleBackground();
      } else {
        handleForeground();
      }
    };

    const onPause = () => handleBackground();
    const onResume = () => handleForeground();

    document.addEventListener("visibilitychange", onVisibilityChange);
    if (Capacitor.isNativePlatform()) {
      window.addEventListener("pause", onPause);
      window.addEventListener("resume", onResume);
    }

    return () => {
      cancelled = true;
      clearHeartbeat();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (Capacitor.isNativePlatform()) {
        window.removeEventListener("pause", onPause);
        window.removeEventListener("resume", onResume);
      }
      void clearPresence().catch(() => {});
    };
  }, [channelKey, enabled]);
}
