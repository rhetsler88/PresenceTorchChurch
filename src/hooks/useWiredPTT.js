import { useState, useEffect, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { isNativeHeadsetPTTAvailable, startNativeHeadsetPTT, setNativeEarbudToggleMode, setNativeHeadsetTransmitting } from "@/lib/headsetPTT";
import { getEarbudToggleMode, PTT_TOGGLE_MAX_MS } from "@/lib/pttSettings";

/** Keys commonly sent by HID / media-style Bluetooth PTT buttons. */
const PTT_KEY_CODES = new Set([
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
  "F13", "F14", "F15", "F16", "F17", "F18", "F19", "F20", "F21", "F22", "F23", "F24",
  "MediaPlayPause", "MediaStop", "MediaTrackNext", "MediaTrackPrevious",
  "AudioVolumeMute",
]);

const MEDIA_TAP_DEBOUNCE_MS = 300;

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return !!target.closest("[contenteditable='true']");
}

function isPttKeyboardEvent(event) {
  return PTT_KEY_CODES.has(event.code);
}

export default function useWiredPTT({ onPress, onRelease }) {
  const [isSupported] = useState(() => {
    if (typeof navigator === "undefined") return false;
    if (isNativeHeadsetPTTAvailable()) return true;
    return "mediaSession" in navigator;
  });

  const [earbudToggleMode, setEarbudToggleMode] = useState(() => getEarbudToggleMode());
  const pressedRef = useRef(false);
  const toggleActiveRef = useRef(false);
  const toggleStartedAtRef = useRef(0);
  const releaseTimerRef = useRef(null);
  const autoStopTimerRef = useRef(null);
  const lastMediaTapRef = useRef(0);
  const mediaKeyDownSeenRef = useRef(false);
  const callbacksRef = useRef({ onPress, onRelease });

  useEffect(() => {
    callbacksRef.current = { onPress, onRelease };
  }, [onPress, onRelease]);

  useEffect(() => {
    const sync = () => setEarbudToggleMode(getEarbudToggleMode());
    window.addEventListener("ptt-settings-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("ptt-settings-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const clearReleaseTimer = useCallback(() => {
    if (releaseTimerRef.current) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
  }, []);

  const clearAutoStopTimer = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  }, []);

  const stopTogglePtt = useCallback(() => {
    if (!toggleActiveRef.current) return;
    clearAutoStopTimer();
    toggleActiveRef.current = false;
    pressedRef.current = false;
    void setNativeHeadsetTransmitting(false);
    callbacksRef.current.onRelease?.();
  }, [clearAutoStopTimer]);

  const startTogglePtt = useCallback(() => {
    if (toggleActiveRef.current || pressedRef.current) return;
    toggleActiveRef.current = true;
    toggleStartedAtRef.current = Date.now();
    pressedRef.current = true;
    clearAutoStopTimer();
    void setNativeHeadsetTransmitting(true);
    callbacksRef.current.onPress?.();
    autoStopTimerRef.current = setTimeout(() => {
      stopTogglePtt();
    }, PTT_TOGGLE_MAX_MS);
  }, [clearAutoStopTimer, stopTogglePtt]);

  const handleMediaTap = useCallback(() => {
    const now = Date.now();
    if (now - lastMediaTapRef.current < MEDIA_TAP_DEBOUNCE_MS) return;
    lastMediaTapRef.current = now;

    if (toggleActiveRef.current) {
      stopTogglePtt();
    } else {
      startTogglePtt();
    }
  }, [startTogglePtt, stopTogglePtt]);

  /** iOS wired/Bluetooth remotes often send play on first press and pause on second. */
  const handleToggleRemoteDown = useCallback(() => {
    if (toggleActiveRef.current) return;
    startTogglePtt();
  }, [startTogglePtt]);

  const handleToggleRemoteUp = useCallback(() => {
    if (!toggleActiveRef.current) return;
    stopTogglePtt();
  }, [stopTogglePtt]);

  const handlePress = useCallback(() => {
    if (pressedRef.current) return;
    pressedRef.current = true;
    clearReleaseTimer();
    void setNativeHeadsetTransmitting(true);
    callbacksRef.current.onPress?.();
  }, [clearReleaseTimer]);

  const handleRelease = useCallback(() => {
    if (!pressedRef.current) return;
    releaseTimerRef.current = setTimeout(() => {
      pressedRef.current = false;
      void setNativeHeadsetTransmitting(false);
      callbacksRef.current.onRelease?.();
    }, 150);
  }, []);

  const handleHoldMediaDown = useCallback(() => {
    mediaKeyDownSeenRef.current = true;
    handlePress();
  }, [handlePress]);

  const handleHoldMediaUp = useCallback(() => {
    if (!mediaKeyDownSeenRef.current) return;
    mediaKeyDownSeenRef.current = false;
    handleRelease();
  }, [handleRelease]);

  useEffect(() => {
    if (!isNativeHeadsetPTTAvailable()) return undefined;
    void setNativeEarbudToggleMode(earbudToggleMode);
  }, [earbudToggleMode]);

  useEffect(() => {
    if (!isNativeHeadsetPTTAvailable()) return undefined;

    let cleanup = () => {};
    let cancelled = false;

    const isIOS = Capacitor.getPlatform() === "ios";
    const nativeHandlers = earbudToggleMode
      ? (isIOS
        ? {
            onTap: handleMediaTap,
            onDown: handleToggleRemoteDown,
            onUp: handleToggleRemoteUp,
          }
        : { onTap: handleMediaTap })
      : { onDown: handleHoldMediaDown, onUp: handleHoldMediaUp };

    startNativeHeadsetPTT({ ...nativeHandlers, earbudToggleMode }).then((stop) => {
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
  }, [
    earbudToggleMode,
    handleMediaTap,
    handleToggleRemoteDown,
    handleToggleRemoteUp,
    handleHoldMediaDown,
    handleHoldMediaUp,
  ]);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return undefined;
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return undefined;

    navigator.mediaSession.metadata ??= new MediaMetadata({
      title: "Presence Torch PTT",
      artist: "Push-to-talk",
    });
    navigator.mediaSession.playbackState = "paused";

    const holdActionHandlers = {
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

    const toggleActionHandlers = {
      play: () => handleMediaTap(),
      pause: () => handleMediaTap(),
      stop: () => {
        if (toggleActiveRef.current) stopTogglePtt();
      },
    };

    const actionHandlers = earbudToggleMode ? toggleActionHandlers : holdActionHandlers;

    try {
      for (const [action, handler] of Object.entries(actionHandlers)) {
        navigator.mediaSession.setActionHandler(/** @type {MediaSessionAction} */ (action), handler);
      }
      if (earbudToggleMode) {
        for (const action of ["previoustrack", "nexttrack", "seekbackward", "seekforward"]) {
          navigator.mediaSession.setActionHandler(/** @type {MediaSessionAction} */ (action), null);
        }
      }
    } catch {
      // Some actions may not be supported on all browsers.
    }

    return () => {
      try {
        for (const action of Object.keys(holdActionHandlers)) {
          navigator.mediaSession.setActionHandler(/** @type {MediaSessionAction} */ (action), null);
        }
      } catch {
        // ignore
      }
      clearReleaseTimer();
    };
  }, [
    earbudToggleMode,
    handlePress,
    handleRelease,
    handleMediaTap,
    stopTogglePtt,
    clearReleaseTimer,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const onKeyDown = (event) => {
      if (event.repeat || !isPttKeyboardEvent(event)) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      handlePress();
    };

    const onKeyUp = (event) => {
      if (!isPttKeyboardEvent(event)) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      handleRelease();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [handlePress, handleRelease]);

  useEffect(() => {
    return () => {
      clearReleaseTimer();
      clearAutoStopTimer();
      if (toggleActiveRef.current) {
        toggleActiveRef.current = false;
        pressedRef.current = false;
        callbacksRef.current.onRelease?.();
      }
    };
  }, [clearAutoStopTimer, clearReleaseTimer]);

  return { isSupported, earbudToggleMode };
}
