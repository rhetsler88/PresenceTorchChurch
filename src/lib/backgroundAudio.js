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
export async function startBackgroundAudio({ title = "Presence Torch", silent = false } = {}) {
  if (!isBackgroundAudioAvailable()) return;

  sessionRefCount += 1;
  activeTitle = title;

  if (sessionRefCount === 1) {
    await BackgroundAudio.startSession({ title, silent });
  } else if (title !== activeTitle || silent) {
    await BackgroundAudio.startSession({ title, silent });
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

/** Stop native background listen before mic capture — ignores ref count. */
export async function forceStopBackgroundAudio() {
  if (!isBackgroundAudioAvailable()) return;
  sessionRefCount = 0;
  activeTitle = "Presence Torch";
  await BackgroundAudio.stopSession().catch(() => {});
}
