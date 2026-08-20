import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { startBackgroundAudio, stopBackgroundAudio } from "@/lib/backgroundAudio";
import { ensureAudioReady } from "@/lib/pttTones";

/**
 * Keeps native iOS/Android audio sessions alive for Storage-relay PTT receive
 * only while the app is backgrounded — avoids fighting the mic during PTT transmit.
 */
export default function useBackgroundRelayListen({ enabled, title, silent = false }) {
  const sessionActiveRef = useRef(false);

  useEffect(() => {
    if (!enabled || !Capacitor.isNativePlatform()) {
      return undefined;
    }

    const startSession = async () => {
      if (sessionActiveRef.current) return;
      ensureAudioReady();
      await startBackgroundAudio({ title: title || "Presence Torch", silent });
      sessionActiveRef.current = true;
    };

    const stopSession = async () => {
      if (!sessionActiveRef.current) return;
      sessionActiveRef.current = false;
      await stopBackgroundAudio().catch(() => {});
    };

    const onPause = () => {
      void startSession();
    };

    const onResume = () => {
      void stopSession();
    };

    window.addEventListener("pause", onPause);
    window.addEventListener("resume", onResume);

    return () => {
      window.removeEventListener("pause", onPause);
      window.removeEventListener("resume", onResume);
      void stopSession();
    };
  }, [enabled, title, silent]);
}
