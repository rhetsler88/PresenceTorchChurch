import { resolveAudioUrl } from "@/lib/secureAudio";
import {
  getUserListenVolumeRatio,
  PTT_SETTINGS_CHANGED,
  USER_LISTEN_VOLUMES_KEY,
} from "@/lib/pttSettings";

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
/** @type {HTMLAudioElement | null} */
let currentRelayAudio = null;
/** @type {string | null} */
let currentRelaySpeakerId = null;

function stopRelayAudio() {
  if (currentRelayAudio) {
    currentRelayAudio.onended = null;
    currentRelayAudio.onerror = null;
    currentRelayAudio.pause();
    currentRelayAudio = null;
    currentRelaySpeakerId = null;
  }
}

function applySpeakerVolume(audio, speakerUserId) {
  audio.volume = getUserListenVolumeRatio(speakerUserId);
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

  window.addEventListener(PTT_SETTINGS_CHANGED, (event) => {
    if (event.detail?.key !== USER_LISTEN_VOLUMES_KEY || !currentRelayAudio) return;
    const userId = event.detail?.userId;
    if (userId && userId !== currentRelaySpeakerId) return;
    applySpeakerVolume(currentRelayAudio, currentRelaySpeakerId);
  });
}

/**
 * Full message playback via HTML Audio — avoids fetch/CORS on Firebase Storage URLs.
 */
async function playFullAudioViaElement(url, { onEnded, onError, speakerUserId } = {}) {
  const resolved = await resolveAudioUrl(url);
  if (!resolved) throw new Error("Could not resolve audio URL");

  stopAudio();

  return new Promise((resolve, reject) => {
    const audio = new Audio(resolved);
    applySpeakerVolume(audio, speakerUserId);
    currentRelaySpeakerId = speakerUserId || null;
    audio.setAttribute("playsinline", "true");
    audio.setAttribute("webkit-playsinline", "true");
    currentRelayAudio = audio;

    audio.onended = () => {
      if (currentRelayAudio === audio) {
        currentRelayAudio = null;
        currentRelaySpeakerId = null;
      }
      if (onEnded) onEnded();
      resolve({ totalDuration: audio.duration || null });
    };

    audio.onerror = () => {
      if (currentRelayAudio === audio) {
        currentRelayAudio = null;
        currentRelaySpeakerId = null;
      }
      const err = new Error("Audio playback failed");
      if (onError) onError(err);
      reject(err);
    };

    audio.play().catch((err) => {
      if (currentRelayAudio === audio) {
        currentRelayAudio = null;
        currentRelaySpeakerId = null;
      }
      if (onError) onError(err);
      reject(err);
    });
  });
}

/** Plays a complete voice message from the start. */
export async function playAudioUrl(url, { onEnded, onError, speakerUserId } = {}) {
  return playFullAudioViaElement(url, { onEnded, onError, speakerUserId });
}

/**
 * Plays audio from `startSeconds` to the end (live relay chunks).
 * Full playback (startSeconds = 0) uses HTML Audio to avoid Storage CORS.
 */
export async function playAudioTailFromUrl(url, startSeconds = 0, { onEnded, onError, speakerUserId } = {}) {
  if (startSeconds <= 0) {
    return playFullAudioViaElement(url, { onEnded, onError, speakerUserId });
  }
  return playRelayAudioTail(url, startSeconds, { onEnded, onError, speakerUserId });
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
export async function playRelayAudioTail(url, startSeconds = 0, { onEnded, onError, speakerUserId } = {}) {
  const resolved = await resolveAudioUrl(url);
  if (!resolved) throw new Error("Could not resolve audio URL");

  stopRelayAudio();

  return new Promise((resolve, reject) => {
    const audio = new Audio(resolved);
    applySpeakerVolume(audio, speakerUserId);
    currentRelaySpeakerId = speakerUserId || null;
    audio.setAttribute("playsinline", "true");
    audio.setAttribute("webkit-playsinline", "true");
    currentRelayAudio = audio;

    const finish = (totalDuration) => {
      if (currentRelayAudio === audio) {
        currentRelayAudio = null;
        currentRelaySpeakerId = null;
      }
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
        if (currentRelayAudio === audio) {
          currentRelayAudio = null;
          currentRelaySpeakerId = null;
        }
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
      if (currentRelayAudio === audio) {
        currentRelayAudio = null;
        currentRelaySpeakerId = null;
      }
      const err = new Error("Relay audio playback failed");
      if (onError) onError(err);
      reject(err);
    };
  });
}

export { stopRelayAudio };
