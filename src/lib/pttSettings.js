import { Capacitor } from "@capacitor/core";

export const PTT_EARBUD_TOGGLE_KEY = "ptt_earbud_toggle_mode";
export const PTT_TOGGLE_MAX_MS = 45_000;

export function getEarbudToggleMode() {
  if (typeof localStorage === "undefined") return Capacitor.isNativePlatform();
  const stored = localStorage.getItem(PTT_EARBUD_TOGGLE_KEY);
  if (stored === null) return Capacitor.isNativePlatform();
  return stored === "1";
}

export function setEarbudToggleMode(enabled) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PTT_EARBUD_TOGGLE_KEY, enabled ? "1" : "0");
  window.dispatchEvent(new CustomEvent("ptt-settings-changed"));
}
