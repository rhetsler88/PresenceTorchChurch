const LAST_APP_ROUTE_KEY = "presence_last_app_route";

export function saveLastAppRoute(path) {
  if (!path || typeof path !== "string" || !path.startsWith("/")) return;
  try {
    localStorage.setItem(LAST_APP_ROUTE_KEY, path);
  } catch {
    /* ignore quota / private mode */
  }
}

export function getLastAppRoute() {
  try {
    const path = localStorage.getItem(LAST_APP_ROUTE_KEY);
    return path && path.startsWith("/") ? path : null;
  } catch {
    return null;
  }
}

export function clearLastAppRoute() {
  try {
    localStorage.removeItem(LAST_APP_ROUTE_KEY);
  } catch {
    /* ignore */
  }
}
