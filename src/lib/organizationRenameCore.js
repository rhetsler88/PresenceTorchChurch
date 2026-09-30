/** @param {string | undefined | null} value */
export function normalizeOrganizationName(value) {
  return (value || "").trim().toLowerCase();
}

/** Match client userUtils.matchesOrganization for rename fan-out. */
export function organizationNamesMatch(left, right) {
  const scoped = normalizeOrganizationName(left);
  if (!scoped) return true;
  const target = normalizeOrganizationName(right);
  if (!target) return true;
  return scoped === target;
}

/**
 * @param {string} oldName
 * @param {string} newName
 * @param {{ id: string, organization?: string }[]} records
 */
export function idsMatchingOrganizationName(oldName, records) {
  return records
    .filter((row) => organizationNamesMatch(oldName, row.organization))
    .map((row) => row.id);
}

/**
 * @param {{ id: string, name?: string }[]} orgs
 * @param {string} orgId
 * @param {string} newName
 */
export function findOrganizationNameConflict(orgs, orgId, newName) {
  const target = normalizeOrganizationName(newName);
  if (!target) return null;
  return (
    orgs.find(
      (org) => org.id !== orgId && normalizeOrganizationName(org.name) === target
    ) || null
  );
}
