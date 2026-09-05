/** @typedef {{ isCover: boolean, width: number, height: number }} FlipScreenDetail */

const COVER_THRESHOLD_PX = 500;
const RESIZE_DEBOUNCE_MS = 150;

/** @type {ReturnType<typeof setTimeout> | null} */
let resizeTimer = null;
let installed = false;

/** Most flip outer displays are narrower/shorter than 500 CSS px. */
export function isCoverScreenSize(width, height) {
  return width < COVER_THRESHOLD_PX || height < COVER_THRESHOLD_PX;
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
