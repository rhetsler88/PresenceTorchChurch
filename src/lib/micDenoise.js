/**
 * DeepFilterNet mic capture — one denoise pass shared by relay archive + Agora live.
 * Lazy-loads WASM (~18 MB) on first use; prewarmMicDenoise() compiles it early.
 */

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

/** Compile DeepFilterNet WASM ahead of the first PTT press. */
export async function prewarmMicDenoise() {
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
 * Open the mic with optional DeepFilterNet processing.
 * @returns {Promise<{ stream: MediaStream, handle: DenoiseHandle | null, rawStream: MediaStream }>}
 */
export async function openMicWithDenoise() {
  const mod = await loadModule();
  const supported = mod.isVoiceClaritySupported();
  const rawStream = await navigator.mediaDevices.getUserMedia(
    getMicCaptureConstraints(supported)
  );

  if (!supported) {
    return { stream: rawStream, handle: null, rawStream };
  }

  try {
    const handle = await mod.createDenoisedStream(rawStream, MIC_DENOISE_OPTIONS);
    return { stream: handle.stream, handle, rawStream };
  } catch (err) {
    console.warn("DeepFilterNet unavailable, using raw mic:", err);
    return { stream: rawStream, handle: null, rawStream };
  }
}

/**
 * Tear down denoise graph and stop all mic tracks.
 * @param {{ handle?: DenoiseHandle | null, rawStream?: MediaStream | null, stream?: MediaStream | null }} session
 */
export async function destroyMicDenoise({ handle, rawStream, stream } = {}) {
  if (handle) {
    try {
      await handle.destroy();
    } catch (err) {
      console.warn("DeepFilterNet destroy failed:", err);
    }
  }

  const tracks = new Set();
  rawStream?.getTracks().forEach((track) => tracks.add(track));
  if (stream && stream !== rawStream) {
    stream.getTracks().forEach((track) => tracks.add(track));
  }
  tracks.forEach((track) => track.stop());
}
