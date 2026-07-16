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
let currentRelayAudio = null;

function stopRelayAudio() {
  if (currentRelayAudio) {
    currentRelayAudio.onended = null;
    currentRelayAudio.onerror = null;
    currentRelayAudio.pause();
    currentRelayAudio = null;
  }
}

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
  return playAudioTailFromUrl(url, 0, { onEnded, onError });
}

/**
 * Plays audio from `startSeconds` to the end. Used for live relay where each
 * uploaded chunk is a growing recording rather than a standalone fragment.
 */
export async function playAudioTailFromUrl(url, startSeconds = 0, { onEnded, onError } = {}) {
  const ctx = getContext();
  if (ctx.state === "suspended") await ctx.resume();

  stopAudio();

  try {
    const resolved = await resolveAudioUrl(url);
    if (!resolved) throw new Error("Could not resolve audio URL");
    const response = await fetch(resolved);
    const arrayBuffer = await response.arrayBuffer();
    const fullBuffer = await ctx.decodeAudioData(arrayBuffer);
    const totalDuration = fullBuffer.duration;
    const startSample = Math.min(
      Math.max(0, Math.floor(startSeconds * fullBuffer.sampleRate)),
      Math.max(0, fullBuffer.length - 1)
    );
    const tailLength = fullBuffer.length - startSample;

    if (tailLength <= 0) {
      if (onEnded) onEnded();
      return { totalDuration };
    }

    const tailBuffer = ctx.createBuffer(
      fullBuffer.numberOfChannels,
      tailLength,
      fullBuffer.sampleRate
    );
    for (let ch = 0; ch < fullBuffer.numberOfChannels; ch++) {
      tailBuffer.copyToChannel(fullBuffer.getChannelData(ch).subarray(startSample), ch);
    }

    const source = ctx.createBufferSource();
    source.buffer = tailBuffer;
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
    return { totalDuration };
  } catch (e) {
    if (onError) onError(e);
    throw e;
  }
}

export function stopAudio() {
  stopRelayAudio();
  if (currentSource) {
    try {
      currentSource.onended = null;
      currentSource.stop();
    } catch (e) {}
    currentSource = null;
  }
  currentOnEnded = null;
}

/**
 * Plays relay audio via HTML Audio (no fetch/CORS). Each chunk is a growing
 * recording; only the tail after `startSeconds` is heard.
 */
export async function playRelayAudioTail(url, startSeconds = 0, { onEnded, onError } = {}) {
  const resolved = await resolveAudioUrl(url);
  if (!resolved) throw new Error("Could not resolve audio URL");

  stopRelayAudio();

  return new Promise((resolve, reject) => {
    const audio = new Audio(resolved);
    currentRelayAudio = audio;

    const finish = (totalDuration) => {
      if (currentRelayAudio === audio) currentRelayAudio = null;
      resolve({ totalDuration });
    };

    audio.onloadedmetadata = () => {
      const totalDuration = audio.duration || 0;
      if (!Number.isFinite(totalDuration) || startSeconds >= totalDuration) {
        if (onEnded) onEnded();
        finish(totalDuration);
        return;
      }
      audio.currentTime = startSeconds;
      audio.play().catch((err) => {
        if (currentRelayAudio === audio) currentRelayAudio = null;
        if (onError) onError(err);
        reject(err);
      });
    };

    audio.onended = () => {
      const totalDuration = audio.duration || 0;
      if (onEnded) onEnded();
      finish(totalDuration);
    };

    audio.onerror = () => {
      if (currentRelayAudio === audio) currentRelayAudio = null;
      const err = new Error("Relay audio playback failed");
      if (onError) onError(err);
      reject(err);
    };
  });
}

export { stopRelayAudio };