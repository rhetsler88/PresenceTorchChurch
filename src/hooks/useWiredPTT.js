import { useState, useEffect, useCallback, useRef } from "react";

export default function useWiredPTT({ onPress, onRelease }) {
  const [isSupported] = useState(
    () => typeof navigator !== "undefined" && "mediaSession" in navigator
  );
  const pressedRef = useRef(false);
  const releaseTimerRef = useRef(null);

  const handlePress = useCallback(() => {
    if (pressedRef.current) return;
    pressedRef.current = true;
    if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
    onPress?.();
  }, [onPress]);

  const handleRelease = useCallback(() => {
    if (!pressedRef.current) return;
    // Small debounce so rapid double-clicks don't re-trigger
    releaseTimerRef.current = setTimeout(() => {
      pressedRef.current = false;
      onRelease?.();
    }, 150);
  }, [onRelease]);

  useEffect(() => {
    if (!isSupported) return;

    const actionHandlers = {
      play: () => handlePress(),
      pause: () => handleRelease(),
      previoustrack: () => { handlePress(); handleRelease(); },
      nexttrack: () => { handlePress(); handleRelease(); },
      seekbackward: () => { handlePress(); handleRelease(); },
      seekforward: () => { handlePress(); handleRelease(); },
      stop: () => handleRelease(),
    };

    try {
      for (const [action, handler] of Object.entries(actionHandlers)) {
        navigator.mediaSession.setActionHandler(action, handler);
      }
    } catch {
      // Some actions may not be supported on all browsers
    }

    return () => {
      try {
        for (const action of Object.keys(actionHandlers)) {
          navigator.mediaSession.setActionHandler(action, null);
        }
      } catch {
        // ignore
      }
      if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
    };
  }, [handlePress, handleRelease, isSupported]);

  return { isSupported };
}