/** @typedef {{ isCover: boolean, width: number, height: number }} FlipScreenDetail */

/** Razr cover ~264px; normal phones are ~360–430px CSS width — do not treat as cover. */
const COVER_MAX_WIDTH_PX = 320;
/** Landscape strip on flip outer display. */
const COVER_MAX_HEIGHT_PX = 480;
const COVER_LANDSCAPE_MAX_WIDTH_PX = 720;
const RESIZE_DEBOUNCE_MS = 150;

/** @type {ReturnType<typeof setTimeout> | null} */
let resizeTimer = null;
let installed = false;

/** True only on flip outer displays (e.g. Razr cover), not regular phones. */
export function isCoverScreenSize(width, height) {
  if (width <= COVER_MAX_WIDTH_PX) return true;
  if (height <= COVER_MAX_HEIGHT_PX && width <= COVER_LANDSCAPE_MAX_WIDTH_PX) return true;
  return false;
}

/** @returns {FlipScreenDetail} */
export function getFlipScreenDetail() {
  if (typeof window === "undefined") {
    return { isCover: false, width: 0, height: 0 };
  }
  const width = Math.round(window.visualViewport?.width ?? window.innerWidth);
  const height = Math.round(window.visualViewport?.height ?? window.innerHeight);
  return { isCover: isCoverScreenSize(width, height), width, height };
}

function dispatchFlipScreenChange(detail) {
  window.dispatchEvent(new CustomEvent("flipscreenchange", { detail }));
}

/** Toggle cover-screen class and notify listeners. */
export function applyFlipScreenLayout() {
  if (typeof document === "undefined") return getFlipScreenDetail();

  const detail = getFlipScreenDetail();
  document.body.classList.toggle("cover-screen", detail.isCover);
  dispatchFlipScreenChange(detail);
  return detail;
}

function scheduleFlipScreenUpdate() {
  if (typeof window === "undefined") return;
  if (resizeTimer) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    resizeTimer = null;
    applyFlipScreenLayout();
  }, RESIZE_DEBOUNCE_MS);
}

/** Debounced resize listener for fold/unfold cover display transitions. */
export function installFlipScreenHandler() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  applyFlipScreenLayout();

  window.addEventListener("resize", scheduleFlipScreenUpdate);
  window.visualViewport?.addEventListener("resize", scheduleFlipScreenUpdate);
  window.addEventListener("orientationchange", scheduleFlipScreenUpdate);
  window.addEventListener("resume", scheduleFlipScreenUpdate);
}
