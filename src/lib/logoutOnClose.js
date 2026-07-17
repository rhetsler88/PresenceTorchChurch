import { clearDailyCodeSession } from "@/lib/dailyCode";

export const LOGIN_TIME_KEY = "presence_login_time";
const CLOSE_LOGOUT_FLAG = "presence_logout_on_next_start";

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
 * Sign out when the user closes the tab/app window.
 * Does not run when the app is only backgrounded (tab switch, home button).
 */
export function installCloseLogoutHandler(logout) {
  const handlePageHide = (event) => {
    // persisted = page entered back/forward cache; user may return without reopening
    if (event.persisted) return;
    markLogoutOnClose();
    logout(false).catch(() => {});
  };

  window.addEventListener("pagehide", handlePageHide);
  return () => window.removeEventListener("pagehide", handlePageHide);
}
