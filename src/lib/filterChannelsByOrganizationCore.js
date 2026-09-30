function normalizeOrganization(value) {
  return (value || "").trim().toLowerCase();
}

/** Empty/missing target org is visible to scoped admins (matches Firestore channelOrgMatchesUser). */
function matchesOrganization(adminOrg, targetOrg) {
  const scoped = normalizeOrganization(adminOrg);
  if (!scoped) return true;
  const target = normalizeOrganization(targetOrg);
  if (!target) return true;
  return scoped === target;
}

/** Org-scoped channel list (matches Admin.jsx). Empty org => all channels. Super admin => all. */
export function filterChannelsByOrganization(user, channels) {
  if (!channels?.length) return [];
  if (user?.role === "super_admin") return channels;
  const org = user?.organization?.trim();
  if (!org) return channels;
  return channels.filter((c) => matchesOrganization(org, c.organization));
}
