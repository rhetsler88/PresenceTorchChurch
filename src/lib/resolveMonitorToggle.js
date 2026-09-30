/**
 * Firestore patch for enabling or disabling passive monitoring on a user.
 * @param {{ user?: { role?: string }, turningOn: boolean }} params
 * @returns {{ is_monitor: boolean, role?: string }}
 */
export function resolveMonitorToggle({ user, turningOn }) {
  if (turningOn) {
    return { is_monitor: true };
  }

  const payload = { is_monitor: false };
  if (user?.role === "monitor") {
    payload.role = "user";
  }
  return payload;
}
