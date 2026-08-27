/**
 * Native platform voice processing — iOS AVAudioSession voice processing,
 * Android MODE_IN_COMMUNICATION (NoiseSuppressor via WebRTC voice path).
 */

import { Capacitor, registerPlugin } from "@capacitor/core";

const NativeVoiceProcessing = registerPlugin("NativeVoiceProcessing");

let enabled = false;

export function isNativeVoiceProcessingAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("NativeVoiceProcessing");
}

/** Configure native voice processing before opening the mic. Idempotent per session. */
export async function enableNativeVoiceProcessing() {
  if (!isNativeVoiceProcessingAvailable() || enabled) return true;
  try {
    await NativeVoiceProcessing.enable();
    enabled = true;
    return true;
  } catch (err) {
    console.warn("Native voice processing unavailable:", err);
    return false;
  }
}

/** Restore default audio mode when mic session ends. */
export async function disableNativeVoiceProcessing() {
  if (!isNativeVoiceProcessingAvailable() || !enabled) return;
  enabled = false;
  try {
    await NativeVoiceProcessing.disable();
  } catch (err) {
    console.warn("Native voice processing disable failed:", err);
  }
}
