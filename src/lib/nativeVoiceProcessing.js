/**
 * Native platform voice processing — iOS AVAudioSession voice processing,
 * Android MODE_IN_COMMUNICATION (NoiseSuppressor via WebRTC voice path).
 */

import { Capacitor, registerPlugin } from "@capacitor/core";

const NativeVoiceProcessing = registerPlugin("NativeVoiceProcessing");

let voiceEnabled = false;
let agoraHolders = 0;

export function isNativeVoiceProcessingAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("NativeVoiceProcessing");
}

/** Configure native voice processing before opening the mic. Idempotent per session. */
export async function enableNativeVoiceProcessing() {
  if (!isNativeVoiceProcessingAvailable() || voiceEnabled) return true;
  try {
    await NativeVoiceProcessing.enable();
    voiceEnabled = true;
    return true;
  } catch (err) {
    console.warn("Native voice processing unavailable:", err);
    return false;
  }
}

/** Restore default audio mode when mic session ends. */
export async function disableNativeVoiceProcessing() {
  if (!isNativeVoiceProcessingAvailable() || !voiceEnabled) return;
  voiceEnabled = false;
  try {
    await NativeVoiceProcessing.disable();
  } catch (err) {
    console.warn("Native voice processing disable failed:", err);
  }
}

/**
 * Activate the native communication session before any Agora join/play.
 * Reference-counted so Talk + Monitor can overlap.
 */
export async function prepareNativeAgoraAudio() {
  if (!isNativeVoiceProcessingAvailable()) return false;
  agoraHolders += 1;
  if (agoraHolders > 1) return true;
  try {
    if (typeof NativeVoiceProcessing.prepareListen === "function") {
      await NativeVoiceProcessing.prepareListen();
    } else {
      await NativeVoiceProcessing.enable();
      voiceEnabled = true;
    }
    return true;
  } catch (err) {
    agoraHolders = Math.max(0, agoraHolders - 1);
    console.warn("Native Agora audio prepare failed:", err);
    return false;
  }
}

export async function releaseNativeAgoraAudio() {
  if (!isNativeVoiceProcessingAvailable() || agoraHolders === 0) return;
  agoraHolders -= 1;
  if (agoraHolders > 0) return;
  try {
    if (typeof NativeVoiceProcessing.releaseListen === "function") {
      await NativeVoiceProcessing.releaseListen();
    }
  } catch (err) {
    console.warn("Native Agora audio release failed:", err);
  }
}

/** Re-apply speaker / communication mode after WebKit resets the route. */
export async function refreshNativeAgoraAudio() {
  if (!isNativeVoiceProcessingAvailable()) return;
  try {
    if (typeof NativeVoiceProcessing.refresh === "function") {
      await NativeVoiceProcessing.refresh();
    } else {
      await NativeVoiceProcessing.enable();
      voiceEnabled = true;
    }
  } catch (err) {
    console.warn("Native Agora audio refresh failed:", err);
  }
}
