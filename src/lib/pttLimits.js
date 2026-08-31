/** Maximum live PTT transmission length before auto-stop. */
export const PTT_MAX_TRANSMISSION_MS = 35000;

export function armPttMaxTransmission(timerRef, onLimitReached) {
  clearPttMaxTransmission(timerRef);
  timerRef.current = window.setTimeout(() => {
    timerRef.current = null;
    onLimitReached?.();
  }, PTT_MAX_TRANSMISSION_MS);
}

export function clearPttMaxTransmission(timerRef) {
  if (timerRef.current != null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}
