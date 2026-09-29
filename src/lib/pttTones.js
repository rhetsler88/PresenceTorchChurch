import { Capacitor, registerPlugin } from "@capacitor/core";
import { pttDebugLog } from "./pttDebugLog.js";

const PttTones = registerPlugin("PttTones");

function isNativePttTonesAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("PttTones");
}

let audioContext = null;
let isUnlocked = false;
let lastClearToneAt = 0;
/** @type {Map<string, number>} */
const lastClearToneByBroadcast = new Map();
let silentKeepAlive = null;

/** Call on user gesture (PTT press, tap) so tones are allowed in the browser. */
export function unlockAudioForPTT() {
  if (typeof window === "undefined") return;
  const firstUnlock = !isUnlocked;
  isUnlocked = true;
  const ctx = getContext();
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }
  if (firstUnlock) {
    window.dispatchEvent(new CustomEvent("ptt-audio-unlocked"));
  }
}

/**
 * Prepare audio for alert tones without requiring a fresh user tap.
 * Native background-audio sessions and a silent web keep-alive satisfy autoplay policy.
 */
export function ensureAudioReady() {
  if (typeof window === "undefined") return;
  unlockAudioForPTT();
  const ctx = getContext();
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }
  if (silentKeepAlive) return;
  try {
    silentKeepAlive = new Audio(
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkZXNjYQAAAAA="
    );
    silentKeepAlive.loop = true;
    silentKeepAlive.volume = 0.001;
    silentKeepAlive.setAttribute("playsinline", "true");
    silentKeepAlive.setAttribute("webkit-playsinline", "true");
    void silentKeepAlive.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

if (typeof window !== "undefined") {
  const events = ["touchstart", "touchend", "mousedown", "click", "keydown"];
  const handler = () => unlockAudioForPTT();
  events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
}

function getContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

/** Wall-clock length of the clear-tone sequence (second beep ends at 180 ms + 120 ms). */
export const CLEAR_TONE_SEQUENCE_MS = 300;

function playTone(frequency, duration, delay = 0, volume = 0.3, type = "square") {
  unlockAudioForPTT();
  const ctx = getContext();
  const endMs = Math.ceil((delay + duration) * 1000) + 20;

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const run = async () => {
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          finish();
          return;
        }
      }
      if (ctx.state === "suspended") {
        finish();
        return;
      }

      const now = ctx.currentTime + delay;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.value = frequency;
      oscillator.type = type;
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
      gainNode.gain.linearRampToValueAtTime(0, now + duration);
      oscillator.onended = finish;
      oscillator.start(now);
      oscillator.stop(now + duration);
    };

    void run();
    setTimeout(finish, endMs);
  });
}

// Two short beeps — you have the clear to talk / someone is keying up
/** @returns {Promise<void>} Resolves when both beeps finish (~300 ms). */
export function playClearTone(broadcastId) {
  return playClearToneNow(broadcastId);
}

async function playNativeClearTone() {
  if (!isNativePttTonesAvailable()) return false;
  try {
    await PttTones.playClearTone();
    return true;
  } catch {
    return false;
  }
}

async function playNativeBusyTone() {
  if (!isNativePttTonesAvailable()) return false;
  try {
    await PttTones.playBusyTone();
    return true;
  } catch {
    return false;
  }
}

async function playClearToneNow(broadcastId) {
  ensureAudioReady();
  const now = Date.now();
  if (broadcastId) {
    const lastForBroadcast = lastClearToneByBroadcast.get(broadcastId);
    // Short per-broadcast dedup — duplicate Firestore/Agora listeners only.
    if (lastForBroadcast != null && now - lastForBroadcast < 800) {
      pttDebugLog("clearTone.skipped", {
        broadcastId,
        reason: "dedup",
        sinceLastMs: now - lastForBroadcast,
      });
      return;
    }
  } else if (now - lastClearToneAt < 800) {
    pttDebugLog("clearTone.skipped", { reason: "dedup-no-broadcast-id" });
    return;
  }

  const ctx = getContext();
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }
  if (ctx.state === "suspended") return;

  const playedAt = Date.now();
  if (broadcastId) {
    lastClearToneByBroadcast.set(broadcastId, playedAt);
    if (lastClearToneByBroadcast.size > 32) {
      for (const [id, ts] of lastClearToneByBroadcast) {
        if (playedAt - ts > 60000) lastClearToneByBroadcast.delete(id);
      }
    }
  }
  lastClearToneAt = playedAt;
  pttDebugLog("clearTone.play", { broadcastId: broadcastId ?? null, native: isNativePttTonesAvailable() });
  if (await playNativeClearTone()) {
    return;
  }
  await Promise.all([
    playTone(800, 0.12, 0),
    playTone(800, 0.12, 0.18),
  ]);
}

// One long low tone — someone is already talking
export function playBusyTone() {
  void playBusyToneNow();
}

async function playBusyToneNow() {
  if (await playNativeBusyTone()) {
    return;
  }
  await playTone(300, 0.6, 0);
}

let lastTextMessageToneAt = 0;
let lastYellowProtectionToneAt = 0;

// Two-beep ding — incoming text message on a channel (short boop, pause, longer booooop)
export function playTextMessageTone() {
  const now = Date.now();
  if (now - lastTextMessageToneAt < 900) return;
  lastTextMessageToneAt = now;
  void playTone(880, 0.12, 0, 0.75, "sine");
  void playTone(880, 0.32, 0.45, 0.75, "sine");
}

// Three rising beeps — protection level changed to YELLOW
export function playYellowProtectionTone() {
  const now = Date.now();
  if (now - lastYellowProtectionToneAt < 600) return;
  lastYellowProtectionToneAt = now;
  void playTone(740, 0.16, 0, 0.5, "sine");
  void playTone(880, 0.16, 0.2, 0.5, "sine");
  void playTone(1040, 0.2, 0.4, 0.5, "sine");
}

// 8 urgent alert beeps — protection level changed to RED
export function playRedAlert() {
  void playTone(880, 0.3, 0, 0.85);
  void playTone(880, 0.3, 0.4, 0.85);
  void playTone(880, 0.3, 0.8, 0.85);
  void playTone(880, 0.3, 1.2, 0.85);
  void playTone(880, 0.3, 1.6, 0.85);
  void playTone(880, 0.3, 2.0, 0.85);
  void playTone(880, 0.3, 2.4, 0.85);
  void playTone(880, 0.3, 2.8, 0.85);
}

export function stopRedAlertVibration() {
  if ("vibrate" in navigator) {
    navigator.vibrate(0);
  }
}
