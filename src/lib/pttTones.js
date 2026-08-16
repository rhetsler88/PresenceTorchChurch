let audioContext = null;
let isUnlocked = false;
let lastClearToneAt = 0;
let silentKeepAlive = null;

/** Call on user gesture (PTT press, tap) so tones are allowed in the browser. */
export function unlockAudioForPTT() {
  if (typeof window === "undefined") return;
  isUnlocked = true;
  const ctx = getContext();
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
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

async function playTone(frequency, duration, delay = 0, volume = 0.3, type = "square") {
  unlockAudioForPTT();
  const ctx = getContext();
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
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
  oscillator.start(now);
  oscillator.stop(now + duration);
}

// Two short beeps — you have the clear to talk / someone is keying up
export function playClearTone() {
  const now = Date.now();
  if (now - lastClearToneAt < 400) return;
  lastClearToneAt = now;
  void playTone(800, 0.12, 0);
  void playTone(800, 0.12, 0.18);
}

// One long low tone — someone is already talking
export function playBusyTone() {
  void playTone(300, 0.6, 0);
}

let lastTextMessageToneAt = 0;

// Single short ding — incoming text message on a channel
export function playTextMessageTone() {
  const now = Date.now();
  if (now - lastTextMessageToneAt < 300) return;
  lastTextMessageToneAt = now;
  void playTone(880, 0.12, 0, 0.28, "sine");
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
