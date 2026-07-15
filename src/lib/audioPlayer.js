import { resolveAudioUrl } from "@/lib/secureAudio";

let audioContext = null;

function getContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  return audioContext;
}

let currentSource = null;
let currentOnEnded = null;

// Unlock AudioContext on first user interaction (required by browser autoplay policies)
let isUnlocked = false;
function unlock() {
  if (isUnlocked) return;
  isUnlocked = true;
  const ctx = getContext();
  if (ctx.state === "suspended") ctx.resume();
}

if (typeof window !== "undefined") {
  const events = ["touchstart", "touchend", "click", "keydown"];
  const handler = () => {
    unlock();
    events.forEach((e) => window.removeEventListener(e, handler));
  };
  events.forEach((e) => window.addEventListener(e, handler, { once: true }));
}

/**
 * Plays an audio URL through the Web Audio API (same AudioContext as the PTT beeps),
 * which is already unlocked after first user interaction and bypasses HTML5 autoplay restrictions.
 */
export async function playAudioUrl(url, { onEnded, onError } = {}) {
  const ctx = getContext();
  if (ctx.state === "suspended") await ctx.resume();

  // Stop any currently playing audio
  stopAudio();

  try {
    const resolved = await resolveAudioUrl(url);
    if (!resolved) throw new Error("Could not resolve audio URL");
    const response = await fetch(resolved);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    currentSource = source;
    currentOnEnded = onEnded;

    source.onended = () => {
      if (currentSource === source) {
        currentSource = null;
      }
      if (currentOnEnded) currentOnEnded();
    };

    source.start(0);
    return source;
  } catch (e) {
    if (onError) onError(e);
    throw e;
  }
}

export function stopAudio() {
  if (currentSource) {
    try {
      currentSource.onended = null;
      currentSource.stop();
    } catch (e) {}
    currentSource = null;
  }
  currentOnEnded = null;
}