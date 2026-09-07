import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { startBackgroundAudio, stopBackgroundAudio } from "@/lib/backgroundAudio";
import { formatActiveChannelsBody } from "@/lib/backgroundAudioNotification";
import { prepareNativeAgoraAudio, releaseNativeAgoraAudio } from "@/lib/nativeVoiceProcessing";
import { ensureAudioReady } from "@/lib/pttTones";

/**
 * Keeps native iOS/Android audio sessions alive for Storage-relay PTT receive
 * while passive listen is active (foreground and background).
 */
export default function useBackgroundRelayListen({
  enabled,
  title,
  channelCount = 1,
}) {
  useEffect(() => {
    if (!enabled || !Capacitor.isNativePlatform()) {
      void stopBackgroundAudio();
      return undefined;
    }

    ensureAudioReady();
    const body = formatActiveChannelsBody(channelCount);
    const preparePromise = prepareNativeAgoraAudio();
    void (async () => {
      await preparePromise;
      await startBackgroundAudio({
        title: title || "Presence Torch",
        body,
        channelCount,
        silent: true,
      });
    })();

    return () => {
      void (async () => {
        await preparePromise;
        await releaseNativeAgoraAudio();
        await stopBackgroundAudio();
      })();
    };
  }, [enabled, title, channelCount]);
}
