import { useState, useEffect, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { isNativeHeadsetPTTAvailable, startNativeHeadsetPTT } from "@/lib/headsetPTT";

export default function useWiredPTT({ onPress, onRelease }) {
  const [isSupported] = useState(() => {
    if (typeof navigator === "undefined") return false;
    if (isNativeHeadsetPTTAvailable()) return true;
    return "mediaSession" in navigator;
  });

  const pressedRef = useRef(false);
  const releaseTimerRef = useRef(null);
  const callbacksRef = useRef({ onPress, onRelease });

  useEffect(() => {
    callbacksRef.current = { onPress, onRelease };
  }, [onPress, onRelease]);

  const handlePress = useCallback(() => {
    if (pressedRef.current) return;
    pressedRef.current = true;
    if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
    callbacksRef.current.onPress?.();
  }, []);

  const handleRelease = useCallback(() => {
    if (!pressedRef.current) return;
    releaseTimerRef.current = setTimeout(() => {
      pressedRef.current = false;
      callbacksRef.current.onRelease?.();
    }, 150);
  }, []);

  useEffect(() => {
    if (!isNativeHeadsetPTTAvailable()) return undefined;

    let cleanup = () => {};
    let cancelled = false;

    startNativeHeadsetPTT({
      onDown: handlePress,
      onUp: handleRelease,
    }).then((stop) => {
      if (cancelled) {
        stop();
        return;
      }
      cleanup = stop;
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [handlePress, handleRelease]);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return undefined;
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return undefined;

    navigator.mediaSession.metadata ??= new MediaMetadata({
      title: "Presence Torch PTT",
      artist: "Push-to-talk",
    });
    navigator.mediaSession.playbackState = "paused";

    const actionHandlers = {
      play: () => handlePress(),
      pause: () => handleRelease(),
      stop: () => handleRelease(),
      previoustrack: () => {
        handlePress();
        handleRelease();
      },
      nexttrack: () => {
        handlePress();
        handleRelease();
      },
      seekbackward: () => {
        handlePress();
        handleRelease();
      },
      seekforward: () => {
        handlePress();
        handleRelease();
      },
    };

    try {
      for (const [action, handler] of Object.entries(actionHandlers)) {
        navigator.mediaSession.setActionHandler(/** @type {MediaSessionAction} */ (action), handler);
      }
    } catch {
      // Some actions may not be supported on all browsers.
    }

    return () => {
      try {
        for (const action of Object.keys(actionHandlers)) {
          navigator.mediaSession.setActionHandler(/** @type {MediaSessionAction} */ (action), null);
        }
      } catch {
        // ignore
      }
      if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
    };
  }, [handlePress, handleRelease]);

  return { isSupported };
}
