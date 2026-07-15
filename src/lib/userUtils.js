/**
 * Returns the user's display name from their input first/last name,
 * falling back to full_name, then "Unknown".
 */
export function getDisplayName(user) {
  if (!user) return "Unknown";
  const first = user.first_name?.trim();
  const last = user.last_name?.trim();
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  if (user.full_name?.trim()) return user.full_name.trim();
  return "Unknown";
}

/**
 * Returns initials from the user's display name.
 */
export function getInitials(user) {
  const name = getDisplayName(user);
  if (name === "Unknown") return "?";
  return name.slice(0, 2).toUpperCase();
}

export function isSuperAdmin(user) {
  return user?.role === "super_admin";
}

export function isOrgAdmin(user) {
  return user?.role === "admin";
}

export function isPlatformAdmin(user) {
  return isSuperAdmin(user) || isOrgAdmin(user);
}

export function canAccessChannel(user, channel) {
  if (!user || !channel) return false;
  if (isSuperAdmin(user)) return true;
  if (isOrgAdmin(user)) {
    return !user.organization || channel.organization === user.organization;
  }
  return (
    channel.members?.includes(user.id) ||
    channel.members?.includes(user.email)
  );
}