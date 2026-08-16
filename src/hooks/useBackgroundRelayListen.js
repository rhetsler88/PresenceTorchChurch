import { useEffect } from "react";
import { startBackgroundAudio, stopBackgroundAudio } from "@/lib/backgroundAudio";
import { ensureAudioReady } from "@/lib/pttTones";

/**
 * Keeps native iOS/Android audio sessions alive for Storage-relay PTT receive
 * while the user is on Talk or Monitor. Does not touch Agora live audio.
 */
export default function useBackgroundRelayListen({ enabled, title }) {
  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;

    (async () => {
      ensureAudioReady();
      await startBackgroundAudio({ title: title || "Presence Torch" });
      ensureAudioReady();
      if (cancelled) {
        await stopBackgroundAudio();
      }
    })();

    return () => {
      cancelled = true;
      stopBackgroundAudio().catch(() => {});
    };
  }, [enabled, title]);
}
