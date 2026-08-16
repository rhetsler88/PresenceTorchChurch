import { Capacitor, registerPlugin } from "@capacitor/core";

const BackgroundAudio = registerPlugin("BackgroundAudio");

let sessionRefCount = 0;
let activeTitle = "Presence Torch";

export function isBackgroundAudioAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("BackgroundAudio");
}

/**
 * Start a native background-audio session for Storage-relay listening.
 * Reference-counted so Talk ↔ Monitor tab switches do not flicker the session.
 */
export async function startBackgroundAudio({ title = "Presence Torch" } = {}) {
  if (!isBackgroundAudioAvailable()) return;

  sessionRefCount += 1;
  activeTitle = title;

  if (sessionRefCount === 1) {
    await BackgroundAudio.startSession({ title });
  } else if (title !== activeTitle) {
    await BackgroundAudio.startSession({ title });
    activeTitle = title;
  }
}

export async function stopBackgroundAudio() {
  if (!isBackgroundAudioAvailable()) return;

  sessionRefCount = Math.max(0, sessionRefCount - 1);
  if (sessionRefCount === 0) {
    await BackgroundAudio.stopSession().catch(() => {});
    activeTitle = "Presence Torch";
  }
}
