/** @typedef {"bypassed" | "code" | "no-org"} DailyCodeCardMode */

function hasOrganization(user) {
  return Boolean((user?.organization || "").trim());
}

/**
 * Which UI branch DailyCodeCard should render for the signed-in admin user.
 * @param {{ role?: string, organization?: string | null } | null | undefined} user
 * @returns {DailyCodeCardMode}
 */
export function dailyCodeCardMode(user) {
  if (user?.role === "super_admin") return "bypassed";
  if (!hasOrganization(user)) return "no-org";
  return "code";
}
