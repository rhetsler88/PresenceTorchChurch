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