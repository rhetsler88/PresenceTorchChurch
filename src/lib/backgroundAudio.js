import { Capacitor, registerPlugin } from "@capacitor/core";
import { formatActiveChannelsBody } from "@/lib/backgroundAudioNotification";

const BackgroundAudio = registerPlugin("BackgroundAudio");

let sessionRefCount = 0;
let activeTitle = "Presence Torch";
let activeBody = formatActiveChannelsBody(1);

export function isBackgroundAudioAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("BackgroundAudio");
}

async function syncSession({ title, body, channelCount }) {
  const nextTitle = title || "Presence Torch";
  const nextBody = body || formatActiveChannelsBody(channelCount ?? 1);
  if (
    sessionRefCount > 0
    && (nextTitle !== activeTitle || nextBody !== activeBody)
  ) {
    await BackgroundAudio.updateSession({ title: nextTitle, body: nextBody }).catch(() => {
      return BackgroundAudio.startSession({ title: nextTitle, body: nextBody, silent: false });
    });
  }
  activeTitle = nextTitle;
  activeBody = nextBody;
}

/**
 * Start a native background-audio session for Storage-relay listening.
 * Reference-counted so Talk ↔ Monitor tab switches do not flicker the session.
 */
export async function startBackgroundAudio({
  title = "Presence Torch",
  body,
  channelCount = 1,
  silent = false,
} = {}) {
  if (!isBackgroundAudioAvailable()) return;

  const resolvedBody = body || formatActiveChannelsBody(channelCount);
  sessionRefCount += 1;

  if (sessionRefCount === 1) {
    await BackgroundAudio.startSession({
      title,
      body: resolvedBody,
      silent,
    });
    activeTitle = title;
    activeBody = resolvedBody;
    return;
  }

  await syncSession({ title, body: resolvedBody, channelCount });
}

export async function stopBackgroundAudio() {
  if (!isBackgroundAudioAvailable()) return;

  sessionRefCount = Math.max(0, sessionRefCount - 1);
  if (sessionRefCount === 0) {
    await BackgroundAudio.stopSession().catch(() => {});
    activeTitle = "Presence Torch";
    activeBody = formatActiveChannelsBody(1);
  }
}

/** Stop native background listen before mic capture — ignores ref count. */
export async function forceStopBackgroundAudio() {
  if (!isBackgroundAudioAvailable()) return;
  sessionRefCount = 0;
  activeTitle = "Presence Torch";
  activeBody = formatActiveChannelsBody(1);
  await BackgroundAudio.stopSession().catch(() => {});
}
