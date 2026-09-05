/** Session anchor for relative ms in device timing logs. */
const sessionAnchorMs = Date.now();

/**
 * Enable with `localStorage.setItem('pttDebug', '1')` on device builds,
 * or automatically in Vite dev.
 */
export function isPttDebugEnabled() {
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) return true;
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("pttDebug") === "1";
  } catch {
    return false;
  }
}

/**
 * Structured PTT timing log — search console for `[PTT-TIMING]`.
 * @param {string} event
 * @param {Record<string, unknown>} [detail]
 */
export function pttDebugLog(event, detail = {}) {
  if (!isPttDebugEnabled()) return;
  const now = Date.now();
  console.info(`[PTT-TIMING +${now - sessionAnchorMs}ms] ${event}`, {
    at: new Date(now).toISOString(),
    ...detail,
  });
}
