import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const DEVICE_ID_KEY = "ptc_push_device_id";

export function isMobileWebUserAgent() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function isPwaInstalled() {
  if (typeof window === "undefined") return false;
  if (window.navigator.standalone === true) return true;
  return ["standalone", "fullscreen", "minimal-ui"].some((mode) =>
    window.matchMedia(`(display-mode: ${mode})`).matches
  );
}

export function getWebPushSurface() {
  return isPwaInstalled() ? "pwa" : "browser";
}

/** One registration slot per native device; one web slot per form factor (mobile vs desktop). */
export function getPushRegistrationKey(surface, deviceId) {
  if (surface === "native") return `native:${deviceId}`;
  const bucket = isMobileWebUserAgent() ? "mobile" : "desktop";
  return `web:${bucket}`;
}

export async function getOrCreateDeviceId() {
  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key: DEVICE_ID_KEY });
    if (value) return value;
    const id = crypto.randomUUID();
    await Preferences.set({ key: DEVICE_ID_KEY, value: id });
    return id;
  }

  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIOS && isSafari;
}
