/** Channel ids eligible for org-scoped “set all protection level” (matches filterChannelsByOrganization). */
export function protectionSetAllTargets(channels, user) {
  if (!Array.isArray(channels) || channels.length === 0 || !user) return [];
  if (user.role === "super_admin") {
    return channels.map((c) => c?.id).filter(Boolean);
  }
  const org = user.organization?.trim();
  if (!org) {
    return channels.map((c) => c?.id).filter(Boolean);
  }
  const scopedOrg = org.toLowerCase();
  return channels
    .filter((c) => {
      const channelOrg = (c?.organization || "").trim();
      if (!channelOrg) return true;
      return channelOrg.toLowerCase() === scopedOrg;
    })
    .map((c) => c.id)
    .filter(Boolean);
}
