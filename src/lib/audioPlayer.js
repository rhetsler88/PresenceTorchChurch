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
 * Full message playback via HTML Audio — avoids fetch/CORS on Firebase Storage URLs.
 */
async function playFullAudioViaElement(url, { onEnded, onError } = {}) {
  const resolved = await resolveAudioUrl(url);
  if (!resolved) throw new Error("Could not resolve audio URL");

  stopAudio();

  return new Promise((resolve, reject) => {
    const audio = new Audio(resolved);
    audio.setAttribute("playsinline", "true");
    audio.setAttribute("webkit-playsinline", "true");
    currentRelayAudio = audio;

    audio.onended = () => {
      if (currentRelayAudio === audio) currentRelayAudio = null;
      if (onEnded) onEnded();
      resolve({ totalDuration: audio.duration || null });
    };

    audio.onerror = () => {
      if (currentRelayAudio === audio) currentRelayAudio = null;
      const err = new Error("Audio playback failed");
      if (onError) onError(err);
      reject(err);
    };

    audio.play().catch((err) => {
      if (currentRelayAudio === audio) currentRelayAudio = null;
      if (onError) onError(err);
      reject(err);
    });
  });
}

/** Plays a complete voice message from the start. */
export async function playAudioUrl(url, { onEnded, onError } = {}) {
  return playFullAudioViaElement(url, { onEnded, onError });
}

/**
 * Plays audio from `startSeconds` to the end (live relay chunks).
 * Full playback (startSeconds = 0) uses HTML Audio to avoid Storage CORS.
 */
export async function playAudioTailFromUrl(url, startSeconds = 0, { onEnded, onError } = {}) {
  if (startSeconds <= 0) {
    return playFullAudioViaElement(url, { onEnded, onError });
  }
  return playRelayAudioTail(url, startSeconds, { onEnded, onError });
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
    audio.setAttribute("playsinline", "true");
    audio.setAttribute("webkit-playsinline", "true");
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
