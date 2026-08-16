import AgoraRTC from "agora-rtc-sdk-ng";
import { AIDenoiserExtension } from "agora-extension-ai-denoiser";
import { configureAgoraSdk } from "@/lib/agoraInit";

/** @type {AIDenoiserExtension | null} */
let denoiserExtension = null;
let registerAttempted = false;
/** @type {boolean | null} */
let ainsSupported = null;

function getAssetsPath() {
  const base = import.meta.env.BASE_URL || "/";
  const normalized = `${base}agora-ai-denoiser`.replace(/\/{2,}/g, "/");
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function ensureAinsRegistered() {
  configureAgoraSdk();
  if (registerAttempted) return;
  registerAttempted = true;

  try {
    denoiserExtension = new AIDenoiserExtension({ assetsPath: getAssetsPath() });
    if (!denoiserExtension.checkCompatibility()) {
      ainsSupported = false;
      denoiserExtension = null;
      return;
    }
    AgoraRTC.registerExtensions([denoiserExtension]);
    ainsSupported = true;
  } catch (err) {
    console.warn("Agora AINS extension unavailable:", err);
    ainsSupported = false;
    denoiserExtension = null;
  }
}

/** Whether Agora AI noise suppression can run in this browser. */
export function isAinsAvailable() {
  ensureAinsRegistered();
  return ainsSupported === true;
}

/**
 * Pipe Agora AINS onto a local audio track: aggressive denoising + low latency (~40 ms).
 * @param {import('agora-rtc-sdk-ng').ILocalAudioTrack} localTrack
 * @returns {Promise<import('agora-extension-ai-denoiser').AIDenoiserProcessor | null>}
 */
export async function attachAinsToTrack(localTrack) {
  ensureAinsRegistered();
  if (!denoiserExtension || !ainsSupported) return null;

  const processor = denoiserExtension.createProcessor();
  localTrack.pipe(processor).pipe(localTrack.processorDestination);
  await processor.enable();
  await processor.setLevel("AGGRESSIVE");
  await processor.setLatency("LOW");

  processor.on("overload", async () => {
    try {
      await processor.setMode("STATIONARY_NS");
    } catch (err) {
      console.warn("AINS overload fallback failed:", err);
    }
  });

  return processor;
}

/**
 * @param {import('agora-rtc-sdk-ng').ILocalAudioTrack | null | undefined} localTrack
 * @param {import('agora-extension-ai-denoiser').AIDenoiserProcessor | null | undefined} processor
 */
export async function detachAinsFromTrack(localTrack, processor) {
  if (!processor) return;
  try {
    localTrack?.unpipe?.();
    await processor.destroy();
  } catch (err) {
    console.warn("AINS cleanup failed:", err);
  }
}
