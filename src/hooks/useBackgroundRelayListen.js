import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { startBackgroundAudio, stopBackgroundAudio } from "@/lib/backgroundAudio";
import { ensureAudioReady } from "@/lib/pttTones";

function installNativeBackgroundKeepAlive() {
  if (!Capacitor.isNativePlatform()) {
    return () => {};
  }

  const onBackground = () => {
    ensureAudioReady();
  };

  const onForeground = () => {
    ensureAudioReady();
  };

  window.addEventListener("pause", onBackground);
  window.addEventListener("resume", onForeground);

  return () => {
    window.removeEventListener("pause", onBackground);
    window.removeEventListener("resume", onForeground);
  };
}

/**
 * Keeps native iOS/Android audio sessions alive for Storage-relay PTT receive
 * while the user is on Talk or Monitor. Does not touch Agora live audio.
 */
export default function useBackgroundRelayListen({ enabled, title, silent = false }) {
  useEffect(() => installNativeBackgroundKeepAlive(), []);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;

    (async () => {
      ensureAudioReady();
      await startBackgroundAudio({ title: title || "Presence Torch", silent });
      ensureAudioReady();
      if (cancelled) {
        await stopBackgroundAudio();
      }
    })();

    return () => {
      cancelled = true;
      stopBackgroundAudio().catch(() => {});
    };
  }, [enabled, title, silent]);
}
