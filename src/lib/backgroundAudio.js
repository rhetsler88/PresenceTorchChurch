import { Capacitor, registerPlugin } from "@capacitor/core";
import { formatActiveChannelsBody } from "@/lib/backgroundAudioNotification";

const BackgroundAudio = registerPlugin("BackgroundAudio");

let sessionRefCount = 0;
let activeTitle = "Presence Torch";
let activeBody = formatActiveChannelsBody(1);
let activeSilent = false;

export function isBackgroundAudioAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("BackgroundAudio");
}

async function syncSession({ title, body, channelCount, silent = activeSilent }) {
  const nextTitle = title || "Presence Torch";
  const nextBody = body || formatActiveChannelsBody(channelCount ?? 1);
  if (
    sessionRefCount > 0
    && (
      nextTitle !== activeTitle
      || nextBody !== activeBody
      || silent !== activeSilent
    )
  ) {
    await BackgroundAudio.updateSession({
      title: nextTitle,
      body: nextBody,
      silent,
    }).catch(() => {
      return BackgroundAudio.startSession({
        title: nextTitle,
        body: nextBody,
        silent,
      });
    });
  }
  activeTitle = nextTitle;
  activeBody = nextBody;
  activeSilent = silent;
}

export async function updateBackgroundAudio({
  title = "Presence Torch",
  body,
  channelCount = 1,
  silent = activeSilent,
} = {}) {
  if (!isBackgroundAudioAvailable() || sessionRefCount === 0) return;
  await syncSession({ title, body, channelCount, silent });
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
    activeSilent = silent;
    return;
  }

  await syncSession({ title, body: resolvedBody, channelCount, silent });
}

export async function stopBackgroundAudio() {
  if (!isBackgroundAudioAvailable()) return;

  sessionRefCount = Math.max(0, sessionRefCount - 1);
  if (sessionRefCount === 0) {
    await BackgroundAudio.stopSession().catch(() => {});
    activeTitle = "Presence Torch";
    activeBody = formatActiveChannelsBody(1);
    activeSilent = false;
  }
}

/** Stop native background listen before mic capture — ignores ref count. */
export async function forceStopBackgroundAudio() {
  if (!isBackgroundAudioAvailable()) return;
  sessionRefCount = 0;
  activeTitle = "Presence Torch";
  activeBody = formatActiveChannelsBody(1);
  activeSilent = false;
  await BackgroundAudio.stopSession().catch(() => {});
}
