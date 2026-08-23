const LAST_PTT_SURFACE_KEY = "presence_last_ptt_surface";

/** @typedef {"talk" | "monitor"} PttSurface */

/** @returns {PttSurface | null} */
export function pttSurfaceFromPath(pathname) {
  if (!pathname || typeof pathname !== "string") return null;
  if (pathname === "/monitor" || pathname.startsWith("/monitor/")) return "monitor";
  if (pathname === "/" || pathname.startsWith("/?")) return "talk";
  return null;
}

/** @param {PttSurface} surface */
export function saveLastPttSurface(surface) {
  if (surface !== "talk" && surface !== "monitor") return;
  try {
    localStorage.setItem(LAST_PTT_SURFACE_KEY, surface);
  } catch {
    /* ignore */
  }
}

/** @returns {PttSurface} */
export function getLastPttSurface() {
  try {
    const value = localStorage.getItem(LAST_PTT_SURFACE_KEY);
    return value === "monitor" ? "monitor" : "talk";
  } catch {
    return "talk";
  }
}
