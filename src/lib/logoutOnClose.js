/**
 * Session policy:
 * - Auto sign-out 48 hours after login (SESSION_MAX_MS).
 * - Background: after 6 hours backgrounded, sign out automatically while still
 *   in the background (same effect as swipe-away). Native Android uses an exact
 *   alarm when JS timers are suspended.
 * - Native swipe-away: immediate sign-out via native lifecycle when possible.
 * - Web hard close: sign out when the browser tab/window is closed (next visit).
 */
import { clearDailyCodeSession } from "@/lib/dailyCode";
import { Capacitor } from "@capacitor/core";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

export const IMMEDIATE_LOGOUT_EVENT = "ptc-immediate-logout";

export const LOGIN_TIME_KEY = "presence_login_time";
/** Web tab/window closed — sign out on the next visit (not subject to the 6h rule). */
const HARD_CLOSE_LOGOUT_FLAG = "presence_logout_on_next_start";
/** App/tab backgrounded — sign out after BACKGROUND_LOGOUT_MS. */
const BACKGROUND_PENDING_FLAG = "presence_background_pending";
const BACKGROUNDED_AT_KEY = "presence_backgrounded_at";
const OAUTH_REDIRECT_KEY = "presence_oauth_redirect";
const TAB_SESSION_KEY = "ptc_tab_session";

/** Maximum session length from login (48 hours). */
export const SESSION_MAX_MS = 48 * 60 * 60 * 1000;

/** Sign out after this long in the background (6 hours). */
export const BACKGROUND_LOGOUT_MS = 6 * 60 * 60 * 1000;

const BACKGROUND_LOGOUT_WATCH_MS = 60_000;

let immediateLogoutInFlight = false;
let backgroundLogoutTimerId = null;
let backgroundLogoutWatchId = null;

export function recordLoginTime() {
  immediateLogoutInFlight = false;
  localStorage.setItem(LOGIN_TIME_KEY, Date.now().toString());
}

export function clearLoginTime() {
  localStorage.removeItem(LOGIN_TIME_KEY);
}

export function getLoginTime() {
  const raw = localStorage.getItem(LOGIN_TIME_KEY);
  if (!raw) return null;
  const ts = parseInt(raw, 10);
  return Number.isFinite(ts) ? ts : null;
}

export function isSessionExpired() {
  const loginTime = getLoginTime();
  if (!loginTime) return false;
  return Date.now() - loginTime >= SESSION_MAX_MS;
}

export function getSessionRemainingMs() {
  const loginTime = getLoginTime();
  if (!loginTime) return null;
  return SESSION_MAX_MS - (Date.now() - loginTime);
}

/** Set before native Google sign-in so auth init does not time out during account picker. */
const NATIVE_GOOGLE_SIGNIN_KEY = "presence_native_google_signin";

export function markNativeGoogleSignInPending() {
  sessionStorage.setItem(NATIVE_GOOGLE_SIGNIN_KEY, "1");
}

export function clearNativeGoogleSignInPending() {
  sessionStorage.removeItem(NATIVE_GOOGLE_SIGNIN_KEY);
}

export function isNativeGoogleSignInPending() {
  return sessionStorage.getItem(NATIVE_GOOGLE_SIGNIN_KEY) === "1";
}

/** Set before signInWithRedirect navigates away so pagehide does not force sign-out. */
export function markOAuthRedirectPending() {
  sessionStorage.setItem(OAUTH_REDIRECT_KEY, "1");
}

export function clearOAuthRedirectPending() {
  sessionStorage.removeItem(OAUTH_REDIRECT_KEY);
}

function isOAuthRedirectPending() {
  return sessionStorage.getItem(OAUTH_REDIRECT_KEY) === "1";
}

export function isGoogleSignInRedirectPending() {
  return isOAuthRedirectPending();
}

/**
 * sessionStorage survives refresh but is cleared when the tab closes.
 * Returns true when this load is a refresh / same-tab navigation (not a new tab).
 */
export function isSameTabReload() {
  const nav = performance.getEntriesByType?.("navigation")?.[0];
  if (nav?.type === "reload" || nav?.type === "back_forward") {
    return true;
  }
  return sessionStorage.getItem(TAB_SESSION_KEY) === "1";
}

/** Call once at app boot before reading the close-logout flag. */
export function markTabSessionAlive() {
  sessionStorage.setItem(TAB_SESSION_KEY, "1");
}

function getBackgroundedAt() {
  const raw = localStorage.getItem(BACKGROUNDED_AT_KEY);
  if (!raw) return null;
  const ts = parseInt(raw, 10);
  return Number.isFinite(ts) ? ts : null;
}

function cancelBackgroundLogoutWatch() {
  if (backgroundLogoutTimerId != null) {
    clearTimeout(backgroundLogoutTimerId);
    backgroundLogoutTimerId = null;
  }
  if (backgroundLogoutWatchId != null) {
    clearInterval(backgroundLogoutWatchId);
    backgroundLogoutWatchId = null;
  }
}

function triggerBackgroundTimeoutLogout() {
  cancelBackgroundLogoutWatch();
  if (!isBackgroundPending() || !isBackgroundLogoutDue()) return;
  performImmediateLogout();
}

function scheduleBackgroundLogoutWatch() {
  cancelBackgroundLogoutWatch();
  if (!isBackgroundPending()) return;

  const backgroundedAt = getBackgroundedAt();
  if (!backgroundedAt) return;

  const remaining = BACKGROUND_LOGOUT_MS - (Date.now() - backgroundedAt);
  if (remaining <= 0) {
    triggerBackgroundTimeoutLogout();
    return;
  }

  backgroundLogoutTimerId = setTimeout(() => {
    backgroundLogoutTimerId = null;
    triggerBackgroundTimeoutLogout();
  }, remaining);

  backgroundLogoutWatchId = setInterval(() => {
    if (isBackgroundLogoutDue()) {
      triggerBackgroundTimeoutLogout();
    }
  }, BACKGROUND_LOGOUT_WATCH_MS);
}

/** App/tab moved to background. Starts the 6-hour auto sign-out timer. */
export function markBackgroundPending() {
  localStorage.setItem(BACKGROUND_PENDING_FLAG, "1");
  localStorage.setItem(BACKGROUNDED_AT_KEY, Date.now().toString());
  scheduleBackgroundLogoutWatch();
}

export function clearBackgroundPending() {
  cancelBackgroundLogoutWatch();
  localStorage.removeItem(BACKGROUND_PENDING_FLAG);
  localStorage.removeItem(BACKGROUNDED_AT_KEY);
}

export function isBackgroundPending() {
  return localStorage.getItem(BACKGROUND_PENDING_FLAG) === "1";
}

export function isBackgroundLogoutDue() {
  if (!isBackgroundPending()) return false;
  const backgroundedAt = getBackgroundedAt();
  if (!backgroundedAt) return false;
  return Date.now() - backgroundedAt >= BACKGROUND_LOGOUT_MS;
}

function clearHardCloseLogoutFlag() {
  localStorage.removeItem(HARD_CLOSE_LOGOUT_FLAG);
}

function consumeHardCloseLogoutFlag() {
  if (localStorage.getItem(HARD_CLOSE_LOGOUT_FLAG) !== "1") return false;
  clearHardCloseLogoutFlag();
  return true;
}

/** Tab/window closed (web). Next visit signs out immediately. */
export function markLogoutOnClose() {
  clearLoginTime();
  clearDailyCodeSession();
  localStorage.setItem(HARD_CLOSE_LOGOUT_FLAG, "1");
}

/**
 * Immediate sign-out (swipe-away, 6h background timeout, or native alarm).
 * Native code calls window.__ptcImmediateLogout().
 */
export function performImmediateLogout() {
  if (immediateLogoutInFlight) return;
  immediateLogoutInFlight = true;
  cancelBackgroundLogoutWatch();
  clearLoginTime();
  clearDailyCodeSession();
  clearBackgroundPending();
  localStorage.setItem(HARD_CLOSE_LOGOUT_FLAG, "1");
  void signOut(auth).catch(() => {});
  window.dispatchEvent(new CustomEvent(IMMEDIATE_LOGOUT_EVENT));
}

export function registerImmediateLogoutBridge() {
  if (typeof window === "undefined") return;
  window.__ptcImmediateLogout = performImmediateLogout;
}

export function unregisterImmediateLogoutBridge() {
  if (typeof window === "undefined") return;
  delete window.__ptcImmediateLogout;
}

function resolveStartupLogout() {
  if (consumeHardCloseLogoutFlag()) {
    clearBackgroundPending();
    return true;
  }
  if (isBackgroundLogoutDue()) {
    clearBackgroundPending();
    return true;
  }
  if (isBackgroundPending()) {
    // Backgrounded but never resumed — process/tab was closed (swipe-away, browser kill).
    clearBackgroundPending();
    return true;
  }
  clearBackgroundPending();
  return false;
}

/**
 * Whether this launch should sign out due to a prior close or long background.
 * Marks the tab session alive for the next navigation check (web).
 */
export function shouldLogoutAfterClose() {
  if (Capacitor.isNativePlatform()) {
    return resolveStartupLogout();
  }

  const isReload = isSameTabReload();
  markTabSessionAlive();
  if (isReload) {
    clearHardCloseLogoutFlag();
    clearBackgroundPending();
    return false;
  }
  return resolveStartupLogout();
}

function handleForeground() {
  cancelBackgroundLogoutWatch();
  if (isBackgroundLogoutDue()) {
    // Alarm/timer should already have signed out; fallback if the OS deferred JS.
    performImmediateLogout();
    return;
  }
  clearBackgroundPending();
}

/**
 * Background timer (6h) + native alarm (Android). Foreground clears the timer.
 */
export function installCloseLogoutHandler() {
  if (isBackgroundPending()) {
    scheduleBackgroundLogoutWatch();
  }

  if (Capacitor.isNativePlatform()) {
    const handlePause = () => {
      if (isOAuthRedirectPending()) return;
      markBackgroundPending();
    };
    const handleResume = () => {
      handleForeground();
    };

    window.addEventListener("pause", handlePause);
    window.addEventListener("resume", handleResume);
    return () => {
      window.removeEventListener("pause", handlePause);
      window.removeEventListener("resume", handleResume);
      cancelBackgroundLogoutWatch();
    };
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      if (isOAuthRedirectPending()) return;
      markBackgroundPending();
      return;
    }
    if (document.visibilityState === "visible") {
      handleForeground();
    }
  };

  const handlePageHide = (event) => {
    if (event.persisted) return;
    if (isOAuthRedirectPending()) return;
    markLogoutOnClose();
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", handlePageHide);
  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("pagehide", handlePageHide);
    cancelBackgroundLogoutWatch();
  };
}
