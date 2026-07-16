let audioContext = null;
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

function getContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  return audioContext;
}

function playTone(frequency, duration, delay = 0, volume = 0.3) {
  unlock();
  const ctx = getContext();
  const now = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.frequency.value = frequency;
  oscillator.type = "square";
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
  gainNode.gain.linearRampToValueAtTime(0, now + duration);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

// Two short beeps — you have the clear to talk
export function playClearTone() {
  playTone(800, 0.12, 0);
  playTone(800, 0.12, 0.18);
}

// One long low tone — someone is already talking
export function playBusyTone() {
  playTone(300, 0.6, 0);
}

// 8 urgent alert beeps — protection level changed to RED
export function playRedAlert() {
  playTone(880, 0.3, 0, 0.85);
  playTone(880, 0.3, 0.4, 0.85);
  playTone(880, 0.3, 0.8, 0.85);
  playTone(880, 0.3, 1.2, 0.85);
  playTone(880, 0.3, 1.6, 0.85);
  playTone(880, 0.3, 2.0, 0.85);
  playTone(880, 0.3, 2.4, 0.85);
  playTone(880, 0.3, 2.8, 0.85);
}

export function stopRedAlertVibration() {
  if ("vibrate" in navigator) {
    navigator.vibrate(0);
  }
}