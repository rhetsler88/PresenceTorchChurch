import { Capacitor } from "@capacitor/core";
import { ensureAudioReady } from "@/lib/pttTones";
import { probeUnfoldOnResume, scheduleViewportSync, syncViewport } from "@/lib/viewportSync";

/** Nudge WebView/React to repaint after native resume (fold/unfold, notification tap). */
function forceUiRepaint() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!root) return;
  root.style.transform = "translateZ(0)";
  requestAnimationFrame(() => {
    root.style.transform = "";
  });
}

function handleAppResume() {
  ensureAudioReady();
  probeUnfoldOnResume();
  syncViewport();
  scheduleViewportSync();
  // Fold/unfold animations can finish after the first sync.
  window.setTimeout(scheduleViewportSync, 150);
  window.setTimeout(scheduleViewportSync, 400);
  forceUiRepaint();
}

let installed = false;

/** Install once — safe to call from AppLayout on every mount. */
export function installAppResumeHandlers() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("resume", handleAppResume);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      handleAppResume();
    }
  });

  if (Capacitor.isNativePlatform()) {
    handleAppResume();
  }
}
