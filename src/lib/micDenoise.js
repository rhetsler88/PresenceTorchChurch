/**
 * DeepFilterNet mic capture — one denoise pass for live publish; raw mic for archive/recording.
 * Lazy-loads WASM (~18 MB) on first use; prewarmMicDenoise() compiles it early.
 *
 * Native apps: DeepFilterNet is disabled — WebView AudioWorklet paths are unreliable with
 * MediaRecorder and Agora. NativeVoiceProcessing configures platform voice processing instead.
 */

import { Capacitor } from "@capacitor/core";
import { enableNativeVoiceProcessing, disableNativeVoiceProcessing } from "@/lib/nativeVoiceProcessing";

/** @typedef {import('denoise-voice-clarity').DenoiseHandle} DenoiseHandle */

/** Soft suppression for loud worship — moderate attenuation, light presence lift. */
export const MIC_DENOISE_OPTIONS = {
  enabled: true,
  attenuationLimitDb: 25,
  presenceGainDb: 3,
};

/** @type {Promise<typeof import('denoise-voice-clarity')> | null} */
let modulePromise = null;

/** @type {Promise<boolean> | null} */
let prewarmPromise = null;

function loadModule() {
  if (!modulePromise) {
    modulePromise = import("denoise-voice-clarity");
  }
  return modulePromise;
}

/** DeepFilterNet runs on web/desktop only — native apps use platform voice processing. */
export function shouldUseDeepFilterNet() {
  return !Capacitor.isNativePlatform();
}

/** Compile DeepFilterNet WASM ahead of the first PTT press (web/desktop only). */
export async function prewarmMicDenoise() {
  if (!shouldUseDeepFilterNet()) return false;
  if (prewarmPromise) return prewarmPromise;

  prewarmPromise = (async () => {
    try {
      const mod = await loadModule();
      if (!mod.isVoiceClaritySupported()) return false;
      await mod.compileCore();
      return true;
    } catch (err) {
      console.warn("DeepFilterNet prewarm failed:", err);
      return false;
    }
  })();

  return prewarmPromise;
}

export async function isMicDenoiseSupported() {
  if (!shouldUseDeepFilterNet()) return false;
  try {
    const mod = await loadModule();
    return mod.isVoiceClaritySupported();
  } catch {
    return false;
  }
}

/** getUserMedia constraints — disable browser NS/AGC when DeepFilterNet will run. */
export function getMicCaptureConstraints(useDeepFilter) {
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: !useDeepFilter,
      autoGainControl: !useDeepFilter,
    },
  };
}

/**
 * Open mic with optional DeepFilterNet on the publish path only.
 * @returns {Promise<{
 *   recordStream: MediaStream,
 *   publishStream: MediaStream,
 *   handle: DenoiseHandle | null,
 *   rawStream: MediaStream,
 * }>}
 */
export async function openMicSession() {
  const useNativeVoice = Capacitor.isNativePlatform();
  if (useNativeVoice) {
    await enableNativeVoiceProcessing();
  }

  try {
    const canDenoise = shouldUseDeepFilterNet() && await isMicDenoiseSupported();
    const rawStream = await navigator.mediaDevices.getUserMedia(
      getMicCaptureConstraints(canDenoise)
    );

    if (!canDenoise) {
      return {
        recordStream: rawStream,
        publishStream: rawStream,
        handle: null,
        rawStream,
      };
    }

    try {
      const mod = await loadModule();
      const handle = await mod.createDenoisedStream(rawStream, MIC_DENOISE_OPTIONS);
      return {
        recordStream: rawStream,
        publishStream: handle.stream,
        handle,
        rawStream,
      };
    } catch (err) {
      console.warn("DeepFilterNet unavailable, using raw mic:", err);
      return {
        recordStream: rawStream,
        publishStream: rawStream,
        handle: null,
        rawStream,
      };
    }
  } catch (err) {
    if (useNativeVoice) {
      await disableNativeVoiceProcessing();
    }
    throw err;
  }
}

/** @deprecated Use openMicSession */
export async function openMicWithDenoise() {
  const session = await openMicSession();
  return {
    stream: session.publishStream,
    handle: session.handle,
    rawStream: session.rawStream,
  };
}

/**
 * Tear down denoise graph and stop all mic tracks.
 * @param {{ handle?: DenoiseHandle | null, rawStream?: MediaStream | null, stream?: MediaStream | null, recordStream?: MediaStream | null, publishStream?: MediaStream | null }} session
 */
export async function destroyMicDenoise({
  handle,
  rawStream,
  stream,
  recordStream,
  publishStream,
} = {}) {
  if (handle) {
    try {
      await handle.destroy();
    } catch (err) {
      console.warn("DeepFilterNet destroy failed:", err);
    }
  }

  const tracks = new Set();
  for (const src of [rawStream, recordStream, publishStream, stream]) {
    src?.getTracks().forEach((track) => tracks.add(track));
  }
  tracks.forEach((track) => track.stop());

  if (Capacitor.isNativePlatform()) {
    await disableNativeVoiceProcessing();
  }
}
