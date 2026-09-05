import { pttDebugLog } from "./pttDebugLog.js";

/** Maximum live PTT transmission length before auto-stop. */
export const PTT_MAX_TRANSMISSION_MS = 35000;

export function armPttMaxTransmission(timerRef, onLimitReached, meta = {}) {
  clearPttMaxTransmission(timerRef);
  pttDebugLog("maxDuration.armed", {
    limitMs: PTT_MAX_TRANSMISSION_MS,
    ...meta,
  });
  timerRef.current = window.setTimeout(() => {
    timerRef.current = null;
    pttDebugLog("maxDuration.fired", meta);
    onLimitReached?.();
  }, PTT_MAX_TRANSMISSION_MS);
}

export function clearPttMaxTransmission(timerRef) {
  if (timerRef.current != null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}
