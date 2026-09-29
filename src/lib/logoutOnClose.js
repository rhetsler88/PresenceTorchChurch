/**
 * Session policy:
 * - Auto sign-out 48 hours after login (SESSION_MAX_MS).
 * - Idle: after 15 minutes without interaction, an 8-hour foreground timer starts;
 *   sign out when that timer expires (works in foreground and background).
 * - Native swipe-away: immediate sign-out via native lifecycle when possible.
 * - Web hard close: sign out when the browser tab/window is closed (next visit).
 */
import { clearDailyCodeSession } from "@/lib/dailyCode";
import { clearPresence, stopPresenceSession } from "@/lib/presence";
import { Capacitor } from "@capacitor/core";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  clearNativeForceLogoutOnNextStart,
  markNativeForceLogoutOnNextStart,
  syncNativeActiveSession,
  syncNativeGoogleSignInPending,
  syncNativeIdleLogoutDeadline,
} from "@/lib/sessionGuardNative";
import { isSensitiveOperationActive, resetSensitiveOperation } from "@/lib/sensitiveOperation";
import { persistLastLoginAt } from "@/lib/lastLogin";

export const IMMEDIATE_LOGOUT_EVENT = "ptc-immediate-logout";

export const LOGIN_TIME_KEY = "presence_login_time";
const HARD_CLOSE_LOGOUT_FLAG = "presence_logout_on_next_start";
const LAST_INTERACTION_AT_KEY = "presence_last_interaction_at";
const OAUTH_REDIRECT_KEY = "presence_oauth_redirect";
const TAB_SESSION_KEY = "ptc_tab_session";

/** Maximum session length from login (48 hours). */
export const SESSION_MAX_MS = 48 * 60 * 60 * 1000;

/** No interaction for this long before the idle logout timer starts (15 minutes). */
export const IDLE_GRACE_MS = 15 * 60 * 1000;

/** Sign out after this long once the idle timer has started (8 hours). */
export const IDLE_LOGOUT_MS = 8 * 60 * 60 * 1000;

/** @deprecated Use IDLE_GRACE_MS + IDLE_LOGOUT_MS */
export const BACKGROUND_LOGOUT_MS = IDLE_GRACE_MS + IDLE_LOGOUT_MS;

const IDLE_LOGOUT_WATCH_MS = 60_000;

let immediateLogoutInFlight = false;
let idleLogoutTimerId = null;
let idleLogoutWatchId = null;

export function getLastInteractionAt() {
  const raw = localStorage.getItem(LAST_INTERACTION_AT_KEY);
  if (!raw) return null;
  const ts = parseInt(raw, 10);
  return Number.isFinite(ts) ? ts : null;
}

export function getIdleLogoutDeadlineMs(lastInteractionAt = getLastInteractionAt()) {
  if (!lastInteractionAt) return null;
  return lastInteractionAt + IDLE_GRACE_MS + IDLE_LOGOUT_MS;
}

export function isIdleLogoutDue() {
  const deadline = getIdleLogoutDeadlineMs();
  if (!deadline) return false;
  return Date.now() >= deadline;
}

function cancelIdleLogoutWatch() {
  if (idleLogoutTimerId != null) {
    clearTimeout(idleLogoutTimerId);
    idleLogoutTimerId = null;
  }
  if (idleLogoutWatchId != null) {
    clearInterval(idleLogoutWatchId);
    idleLogoutWatchId = null;
  }
}

function triggerIdleTimeoutLogout() {
  cancelIdleLogoutWatch();
  if (!isIdleLogoutDue()) return;
  performImmediateLogout();
}

function scheduleIdleLogoutWatch() {
  cancelIdleLogoutWatch();
  if (!getLoginTime()) return;

  const deadline = getIdleLogoutDeadlineMs();
  if (!deadline) return;

  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    triggerIdleTimeoutLogout();
    return;
  }

  idleLogoutTimerId = setTimeout(() => {
    idleLogoutTimerId = null;
    triggerIdleTimeoutLogout();
  }, remaining);

  idleLogoutWatchId = setInterval(() => {
    if (isIdleLogoutDue()) {
      triggerIdleTimeoutLogout();
    }
  }, IDLE_LOGOUT_WATCH_MS);
}

/** Resets the 15-minute idle grace and 8-hour logout timer. */
export function recordSessionInteraction() {
  if (isOAuthRedirectPending() || isNativeGoogleSignInPending()) return;

  const now = Date.now();
  localStorage.setItem(LAST_INTERACTION_AT_KEY, now.toString());
  scheduleIdleLogoutWatch();
  void syncNativeIdleLogoutDeadline(getIdleLogoutDeadlineMs(now)).catch(() => {});
}

export function clearIdleLogoutState() {
  cancelIdleLogoutWatch();
  localStorage.removeItem(LAST_INTERACTION_AT_KEY);
  void syncNativeIdleLogoutDeadline(0).catch(() => {});
}

export function ensureIdleLogoutWatch() {
  scheduleIdleLogoutWatch();
}

/** @deprecated Idle logout replaces background-pending flags. */
export function clearBackgroundPending() {
  clearIdleLogoutState();
}

export function recordLoginTime() {
  immediateLogoutInFlight = false;
  clearHardCloseLogoutFlag();
  void clearNativeForceLogoutOnNextStart().catch(() => {});
  localStorage.setItem(LOGIN_TIME_KEY, Date.now().toString());
  recordSessionInteraction();
  syncNativeActiveSession(true);
  void syncNativeGoogleSignInPending(false).catch(() => {});
  persistLastLoginAt();
}

export function clearLoginTime() {
  localStorage.removeItem(LOGIN_TIME_KEY);
  clearIdleLogoutState();
  void clearNativeForceLogoutOnNextStart().catch(() => {});
  void syncNativeActiveSession(false).catch(() => {});
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

const NATIVE_GOOGLE_SIGNIN_KEY = "presence_native_google_signin";

export function markNativeGoogleSignInPending() {
  localStorage.setItem(NATIVE_GOOGLE_SIGNIN_KEY, "1");
  void syncNativeGoogleSignInPending(true).catch(() => {});
}

export function clearNativeGoogleSignInPending() {
  localStorage.removeItem(NATIVE_GOOGLE_SIGNIN_KEY);
  void syncNativeGoogleSignInPending(false).catch(() => {});
}

export function isNativeGoogleSignInPending() {
  return localStorage.getItem(NATIVE_GOOGLE_SIGNIN_KEY) === "1";
}

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

export function isSameTabReload() {
  const nav = performance.getEntriesByType?.("navigation")?.[0];
  if (nav?.type === "reload" || nav?.type === "back_forward") {
    return true;
  }
  return sessionStorage.getItem(TAB_SESSION_KEY) === "1";
}

export function markTabSessionAlive() {
  sessionStorage.setItem(TAB_SESSION_KEY, "1");
}

function clearHardCloseLogoutFlag() {
  localStorage.removeItem(HARD_CLOSE_LOGOUT_FLAG);
}

function consumeHardCloseLogoutFlag() {
  if (localStorage.getItem(HARD_CLOSE_LOGOUT_FLAG) !== "1") return false;
  clearHardCloseLogoutFlag();
  return true;
}

export function markLogoutOnClose() {
  clearLoginTime();
  clearDailyCodeSession();
  localStorage.setItem(HARD_CLOSE_LOGOUT_FLAG, "1");
}

export function isImmediateLogoutInFlight() {
  return immediateLogoutInFlight;
}

export function performImmediateLogout() {
  if (immediateLogoutInFlight) return;
  if (isNativeGoogleSignInPending() || isOAuthRedirectPending()) return;
  if (isSensitiveOperationActive()) return;
  if (!auth.currentUser && !getLoginTime()) return;
  immediateLogoutInFlight = true;
  cancelIdleLogoutWatch();
  clearLoginTime();
  clearDailyCodeSession();
  clearNativeGoogleSignInPending();
  localStorage.setItem(HARD_CLOSE_LOGOUT_FLAG, "1");
  void stopPresenceSession();
  void markNativeForceLogoutOnNextStart().catch(() => {});
  void syncNativeActiveSession(false).catch(() => {});
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
    clearIdleLogoutState();
    return true;
  }
  if (isIdleLogoutDue()) {
    clearIdleLogoutState();
    return true;
  }
  return false;
}

export function shouldLogoutAfterClose() {
  if (Capacitor.isNativePlatform()) {
    const shouldLogout = resolveStartupLogout();
    if (!shouldLogout && getLastInteractionAt()) {
      scheduleIdleLogoutWatch();
    }
    return shouldLogout;
  }

  // Returning from Google OAuth or mid-popup sign-in — not a tab-close logout.
  if (isOAuthRedirectPending()) {
    markTabSessionAlive();
    return false;
  }

  const isReload = isSameTabReload();
  markTabSessionAlive();
  if (isReload) {
    clearHardCloseLogoutFlag();
    if (getLastInteractionAt()) {
      scheduleIdleLogoutWatch();
    }
    return false;
  }
  const shouldLogout = resolveStartupLogout();
  if (!shouldLogout && getLastInteractionAt()) {
    scheduleIdleLogoutWatch();
  }
  return shouldLogout;
}

function syncNativeAlarmFromIdleState() {
  const deadline = getIdleLogoutDeadlineMs();
  void syncNativeIdleLogoutDeadline(deadline || 0).catch(() => {});
}

function handleForeground() {
  resetSensitiveOperation();
  if (isIdleLogoutDue()) {
    performImmediateLogout();
    return;
  }
  scheduleIdleLogoutWatch();
}

/**
 * Idle logout watch (15m grace + 8h timer) while signed in.
 * Native Android alarm / iOS scheduler mirrors the JS deadline when the app backgrounds.
 */
export function installCloseLogoutHandler() {
  if (getLastInteractionAt()) {
    scheduleIdleLogoutWatch();
  }

  if (Capacitor.isNativePlatform()) {
    const handlePause = () => {
      if (isOAuthRedirectPending() || isNativeGoogleSignInPending()) return;
      if (!auth.currentUser) return;
      syncNativeAlarmFromIdleState();
    };
    const handleResume = () => {
      handleForeground();
    };

    window.addEventListener("pause", handlePause);
    window.addEventListener("resume", handleResume);
    return () => {
      window.removeEventListener("pause", handlePause);
      window.removeEventListener("resume", handleResume);
      cancelIdleLogoutWatch();
    };
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      if (isOAuthRedirectPending() || isNativeGoogleSignInPending()) return;
      if (!auth.currentUser) return;
      syncNativeAlarmFromIdleState();
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
    cancelIdleLogoutWatch();
  };
}
