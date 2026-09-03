/** @typedef {{ width: number, height: number, layoutWidth: number, isCoverDisplay: boolean }} ViewportSnapshot */

const DEFAULT_VIEWPORT =
  "width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content";

let installed = false;
let lastSyncedWidth = 0;
/** @type {number} Locked cover-screen width — persists until unfold. */
let lockedCoverWidth = 0;

/** Effective visible width — visualViewport on foldable cover screens, else layout width. */
export function getEffectiveViewportWidth() {
  if (typeof window === "undefined") return 0;
  return Math.round(window.visualViewport?.width ?? window.innerWidth);
}

/** Effective visible height. */
export function getEffectiveViewportHeight() {
  if (typeof window === "undefined") return 0;
  return Math.round(window.visualViewport?.height ?? window.innerHeight);
}

/** @returns {ViewportSnapshot} */
export function getViewportSnapshot() {
  const layoutWidth =
    typeof document !== "undefined" ? document.documentElement.clientWidth : 0;
  const width = getEffectiveViewportWidth();
  const height = getEffectiveViewportHeight();
  const screenWidth = typeof window !== "undefined"
    ? Math.max(window.screen?.width ?? 0, window.screen?.height ?? 0)
    : layoutWidth;

  // Cover display: visible area is much narrower than the physical screen.
  // Lock width so we don't oscillate after the meta viewport reflows layout.
  const looksLikeCover = width > 0 && width < 400 && screenWidth > width * 1.3;
  if (looksLikeCover) {
    lockedCoverWidth = width;
  } else if (width >= 400) {
    lockedCoverWidth = 0;
  }

  const isCoverDisplay = lockedCoverWidth > 0;

  return { width, height, layoutWidth, isCoverDisplay };
}

function dispatchViewportChange(detail) {
  window.dispatchEvent(new CustomEvent("appviewportchange", { detail }));
}

/** Reconcile layout viewport with the visible area (Motorola Razr cover, fold transitions). */
export function syncViewport() {
  if (typeof document === "undefined") return;

  const { width, height, layoutWidth, isCoverDisplay } = getViewportSnapshot();
  const root = document.documentElement;
  const effectiveWidth = isCoverDisplay ? lockedCoverWidth : width;

  root.style.setProperty("--app-vw", `${effectiveWidth}px`);
  root.style.setProperty("--app-vh", `${height}px`);
  root.style.setProperty("--app-layout-w", `${layoutWidth}px`);
  root.classList.toggle("cover-display", isCoverDisplay);

  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    const targetContent = isCoverDisplay
      ? `width=${effectiveWidth}, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content`
      : DEFAULT_VIEWPORT;

    if (meta.getAttribute("content") !== targetContent) {
      meta.setAttribute("content", targetContent);
    }
  }

  if (Math.abs(effectiveWidth - lastSyncedWidth) >= 1) {
    lastSyncedWidth = effectiveWidth;
    dispatchViewportChange({ width: effectiveWidth, height, layoutWidth, isCoverDisplay });
  }
}

/** Debounced sync — avoids reflow storms during fold animations. */
let syncTimer = 0;
export function scheduleViewportSync() {
  if (typeof window === "undefined") return;
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(syncViewport, 50);
}

/** Install resize / visualViewport listeners once. */
export function installViewportSync() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  syncViewport();

  window.addEventListener("resize", scheduleViewportSync);
  window.visualViewport?.addEventListener("resize", scheduleViewportSync);
  window.visualViewport?.addEventListener("scroll", scheduleViewportSync);
  window.addEventListener("orientationchange", scheduleViewportSync);
}
