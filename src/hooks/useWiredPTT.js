import { useState, useEffect, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import {
  isNativeHeadsetPTTAvailable,
  startNativeHeadsetPTT,
  setNativeHeadsetTransmitting,
} from "@/lib/headsetPTT";
import { armPttMaxTransmission, clearPttMaxTransmission } from "@/lib/pttLimits";

/** Keys commonly sent by HID / media-style Bluetooth PTT buttons. */
const PTT_KEY_CODES = new Set([
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
  "F13", "F14", "F15", "F16", "F17", "F18", "F19", "F20", "F21", "F22", "F23", "F24",
  "MediaPlayPause", "MediaStop", "MediaTrackNext", "MediaTrackPrevious",
  "AudioVolumeMute",
]);

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

  const pressedRef = useRef(false);
  const releaseTimerRef = useRef(null);
  const maxTransmissionRef = useRef(null);
  const mediaKeyDownSeenRef = useRef(false);
  const callbacksRef = useRef({ onPress, onRelease });

  useEffect(() => {
    callbacksRef.current = { onPress, onRelease };
  }, [onPress, onRelease]);

  const clearReleaseTimer = useCallback(() => {
    if (releaseTimerRef.current) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
  }, []);

  const handleRelease = useCallback(() => {
    if (!pressedRef.current) return;
    clearPttMaxTransmission(maxTransmissionRef);
    releaseTimerRef.current = setTimeout(() => {
      pressedRef.current = false;
      void setNativeHeadsetTransmitting(false);
      callbacksRef.current.onRelease?.();
    }, 150);
  }, []);

  const handlePress = useCallback(() => {
    if (pressedRef.current) return;
    pressedRef.current = true;
    clearReleaseTimer();
    void setNativeHeadsetTransmitting(true);
    armPttMaxTransmission(maxTransmissionRef, handleRelease, { source: "wired-ptt" });
    callbacksRef.current.onPress?.();
  }, [clearReleaseTimer, handleRelease]);

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

    let cleanup = () => {};
    let cancelled = false;

    startNativeHeadsetPTT({
      onDown: handleHoldMediaDown,
      onUp: handleHoldMediaUp,
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
  }, [handleHoldMediaDown, handleHoldMediaUp]);

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
      clearReleaseTimer();
    };
  }, [handlePress, handleRelease, clearReleaseTimer]);

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
      clearPttMaxTransmission(maxTransmissionRef);
      if (pressedRef.current) {
        pressedRef.current = false;
        void setNativeHeadsetTransmitting(false);
        callbacksRef.current.onRelease?.();
      }
    };
  }, [clearReleaseTimer]);

  return { isSupported };
}
