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

function playTone(frequency, duration, delay = 0) {
  const ctx = getContext();
  const now = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.frequency.value = frequency;
  oscillator.type = "sine";
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01);
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

// 5 urgent alert beeps — protection level changed to RED
export function playRedAlert() {
  playTone(900, 0.25, 0);
  playTone(900, 0.25, 0.35);
  playTone(900, 0.25, 0.70);
  playTone(900, 0.25, 1.05);
  playTone(900, 0.25, 1.40);
}