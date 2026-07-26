import { clearDailyCodeSession } from "@/lib/dailyCode";
import { Capacitor } from "@capacitor/core";

export const LOGIN_TIME_KEY = "presence_login_time";
const CLOSE_LOGOUT_FLAG = "presence_logout_on_next_start";
const OAUTH_REDIRECT_KEY = "presence_oauth_redirect";
const TAB_SESSION_KEY = "ptc_tab_session";

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

/** Sync markers so the next app launch forces sign-out even if async logout is cut off. */
export function markLogoutOnClose() {
  localStorage.removeItem(LOGIN_TIME_KEY);
  clearDailyCodeSession();
  localStorage.setItem(CLOSE_LOGOUT_FLAG, "1");
}

export function consumeCloseLogoutFlag() {
  if (localStorage.getItem(CLOSE_LOGOUT_FLAG) !== "1") return false;
  localStorage.removeItem(CLOSE_LOGOUT_FLAG);
  return true;
}

/**
 * Whether the user closed the tab (vs refreshed). Refresh must NOT sign out.
 * Marks the tab session alive for the next navigation check.
 */
export function shouldLogoutAfterClose() {
  if (Capacitor.isNativePlatform()) return false;

  const isReload = isSameTabReload();
  markTabSessionAlive();
  if (isReload) {
    localStorage.removeItem(CLOSE_LOGOUT_FLAG);
    return false;
  }
  return consumeCloseLogoutFlag();
}

/**
 * Sign out when the user closes the tab/app window.
 * Does not run when the app is only backgrounded (tab switch, home button).
 * Refresh is detected on the next load via sessionStorage — do not call logout() here
 * (Firebase signOut during pagehide breaks refresh persistence).
 */
export function installCloseLogoutHandler() {
  if (Capacitor.isNativePlatform()) return () => {};

  const handlePageHide = (event) => {
    // persisted = page entered back/forward cache; user may return without reopening
    if (event.persisted) return;
    // OAuth redirect unloads the page; do not treat that as closing the app.
    if (isOAuthRedirectPending()) return;
    markLogoutOnClose();
  };

  window.addEventListener("pagehide", handlePageHide);
  return () => window.removeEventListener("pagehide", handlePageHide);
}
