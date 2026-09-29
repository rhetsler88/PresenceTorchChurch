import {
  isChannelTalkMember,
  isChannelNotificationMember,
} from "@/lib/channelAlerts";

/**
 * Returns the user's display name from their input first/last name,
 * falling back to full_name, then "Unknown".
 */
export function getDisplayName(user) {
  if (!user) return "Unknown";
  const first = user.first_name?.trim();
  const last = user.last_name?.trim();
  const full = user.full_name?.trim();
  const safeFirst = first && !looksLikeEmail(first) ? first : "";
  const safeFull = full && !looksLikeEmail(full) ? full : "";
  if (safeFirst && last) return `${safeFirst} ${last}`;
  if (safeFirst) return safeFirst;
  if (last) return last;
  if (safeFull) return safeFull;
  return "Unknown";
}

function looksLikeEmail(value) {
  return typeof value === "string" && value.includes("@") && !/\s/.test(value);
}

/** Email stored on the profile, or inferred from name fields when onboarding copied it there. */
export function getProfileEmail(user) {
  if (!user) return "";
  const stored = user.email?.trim();
  if (stored?.includes("@")) return stored;
  for (const field of ["first_name", "full_name"]) {
    const value = user[field]?.trim();
    if (looksLikeEmail(value)) return value.toLowerCase();
  }
  return stored || "";
}

/** True when the user has a real first or full name on their profile (not an email placeholder). */
export function userHasDisplayName(user) {
  if (!user) return false;
  const first = user.first_name?.trim();
  const full = user.full_name?.trim();
  if (first && !looksLikeEmail(first)) return true;
  if (full && !looksLikeEmail(full)) return true;
  return false;
}

/** Name tokens suitable for initials — strips parenthetical nicknames and punctuation. */
function nameTokensForInitials(name) {
  return (name || "")
    .trim()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[()[\]{}]/g, " ")
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word));
}

/**
 * Returns initials from a display name string ("Jane Doe" → "JD", "Jane" → "JA").
 */
export function getInitialsFromName(name) {
  const words = nameTokensForInitials(name);
  if (words.length >= 2) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return "?";
}

/**
 * Returns initials from the user's display name (e.g. "Safety TL (Ryan)" → "ST").
 */
export function getInitials(user) {
  if (!user) return "?";
  const display = getDisplayName(user);
  if (display !== "Unknown") return getInitialsFromName(display);
  if (user.email?.trim()) {
    const local = user.email.split("@")[0];
    return local.slice(0, 2).toUpperCase();
  }
  return "?";
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

export function isDirector(user) {
  return user?.role === "director";
}

export const PLAY_REVIEWER_EMAIL = "playstore-reviewer@presencetorch.net";

let hiddenAppUserIds = new Set();

/** Play Store review account — hidden from in-app user lists and activity. */
export function isPlayReviewerAccount(user) {
  if (!user) return false;
  if (user.play_reviewer_account) return true;
  return user.email?.trim().toLowerCase() === PLAY_REVIEWER_EMAIL;
}

/** Cache hidden user ids whenever the full user list is loaded. */
export function registerHiddenAppUserIds(users) {
  hiddenAppUserIds = new Set(
    (users || []).filter(isPlayReviewerAccount).map((user) => user.id).filter(Boolean),
  );
}

export function isHiddenAppUserId(userId) {
  return Boolean(userId && hiddenAppUserIds.has(userId));
}

export function filterAppVisibleUsers(users) {
  return (users || []).filter((user) => !isPlayReviewerAccount(user));
}

export function isPlayReviewerMessage(message) {
  if (!message) return false;
  if (message.created_by_id && isHiddenAppUserId(message.created_by_id)) return true;
  const email = message.sender_email?.trim().toLowerCase();
  if (email === PLAY_REVIEWER_EMAIL) return true;
  return message.sender_name?.trim() === "Play Store Reviewer";
}

export function filterAppVisibleMessages(messages) {
  return (messages || []).filter((message) => !isPlayReviewerMessage(message));
}

/** Channel member entries that should not appear in app member counts. */
export function getVisibleChannelMemberEntries(channel) {
  return (channel?.members || []).filter((entry) => {
    if (typeof entry === "string" && entry.includes("@")) {
      return entry.trim().toLowerCase() !== PLAY_REVIEWER_EMAIL;
    }
    return !isHiddenAppUserId(entry);
  });
}

export function isLead(user) {
  return user?.role === "lead";
}

/** User-facing role titles (internal role keys unchanged). */
export const ROLE_LABELS = {
  user: "User",
  monitor: "Monitor",
  lead: "Coordinator",
  director: "Team Lead",
  admin: "Admin",
  super_admin: "Super Admin",
};

export function getRoleLabel(role) {
  return ROLE_LABELS[role] || role || "User";
}

export function isChannelLead(user) {
  return isLead(user) || isDirector(user);
}

/** Roles a team lead (director) may assign — channel members on their team only. */
export const DIRECTOR_ASSIGNABLE_ROLES = ["user", "monitor", "lead", "director"];

/** Org admins may assign admin; not super_admin. */
export const ORG_ADMIN_ASSIGNABLE_ROLES = ["user", "monitor", "lead", "director", "admin"];

export const SUPER_ADMIN_ASSIGNABLE_ROLES = [
  "user",
  "monitor",
  "lead",
  "director",
  "admin",
  "super_admin",
];

export function isAdminLevelRole(role) {
  return role === "admin" || role === "super_admin";
}

/** Role keys the signed-in user may assign (UI + client guard). */
export function getAssignableRolesForActor(actor) {
  if (isSuperAdmin(actor)) return SUPER_ADMIN_ASSIGNABLE_ROLES;
  if (isPlatformAdmin(actor)) return ORG_ADMIN_ASSIGNABLE_ROLES;
  if (isDirector(actor)) return DIRECTOR_ASSIGNABLE_ROLES;
  return [];
}

/** Team leads: members of managed channels only. Admins: same org. Admin level requires an admin actor. */
export function canAssignRoleToUser(actor, targetUser, newRole, channels = []) {
  if (!actor?.id || !targetUser?.id || actor.id === targetUser.id) return false;
  if (!getAssignableRolesForActor(actor).includes(newRole)) return false;

  if (isDirector(actor) && !isPlatformAdmin(actor)) {
    if (isAdminLevelRole(targetUser.role)) return false;
    return filterUsersInManagedChannels(actor, [targetUser], channels).length > 0;
  }

  if (isPlatformAdmin(actor)) {
    if (!isSuperAdmin(actor)) {
      if (newRole === "super_admin") return false;
      if (isSuperAdmin(targetUser)) return false;
    }
    return filterUsersByOrganization(actor, [targetUser]).length > 0;
  }

  return false;
}

/** Platform admins and team leads may assign roles (coordinators approve members only). */
export function canManageRoles(user) {
  return isPlatformAdmin(user) || isDirector(user);
}

/** Admin, director, and lead skip daily access code entry. */
export function bypassesDailyCode(user) {
  const role = user?.role || "user";
  return role === "admin" || role === "super_admin" || role === "lead" || role === "director";
}

export function canCreateChannel(user) {
  return isPlatformAdmin(user);
}

/** Org-wide Monitor / Talk / PTT for coordinators and team leads (ignores directed_channels). */
function isLeadOrDirectorInOrg(user, channel) {
  if (!user || !channel) return false;
  if (user.role !== "lead" && user.role !== "director") return false;
  const org = user.organization?.trim();
  if (!org) return true;
  return !channel.organization || matchesOrganization(org, channel.organization);
}

/** Assigned channels — member approvals and channel admin on assigned channels only. */
function isChannelLeadForChannel(user, channel) {
  if (!user || !channel) return false;
  if (user.role !== "lead" && user.role !== "director") return false;
  const directed = user.directed_channels || [];
  if (directed.length > 0) return directed.includes(channel.id);
  const org = user.organization?.trim();
  if (!org) return true;
  return !channel.organization || matchesOrganization(org, channel.organization);
}

/** Rename/color on channels assigned to a lead or director (admins: any org channel). */
export function canEditAssignedChannel(user, channel) {
  if (!user || !channel) return false;
  if (isSuperAdmin(user)) return true;
  if (isOrgAdmin(user)) return isOrgAdminForChannel(user, channel);
  return isChannelLeadForChannel(user, channel);
}

/** Protection level controls — admins org-wide; leads/directors on assigned channels. */
export function canManageChannelProtection(user, channel) {
  if (!user || !channel) return false;
  if (isSuperAdmin(user)) return true;
  if (isOrgAdmin(user)) return isOrgAdminForChannel(user, channel);
  return isChannelLeadForChannel(user, channel);
}

function isMonitorForChannel(user, channel) {
  if (!user || !channel) return false;
  if (user.role !== "monitor" && user.is_monitor !== true) return false;
  const org = user.organization?.trim();
  if (!org) return true;
  return !channel.organization || channel.organization === org;
}

export function isDedicatedMonitorUser(user) {
  return user?.role === "monitor" || user?.is_monitor === true;
}

/** Admin-configured monitor restrictions (listen + broadcast). */
export function getMonitorBroadcastExcludedChannelIds(user) {
  const ids = user?.broadcast_excluded_channels;
  if (!Array.isArray(ids) || ids.length === 0) return new Set();
  return new Set(ids.filter(Boolean));
}

export function isMonitorBroadcastExcluded(user, channelId) {
  if (!isDedicatedMonitorUser(user) || !channelId) return false;
  return getMonitorBroadcastExcludedChannelIds(user).has(channelId);
}

function applyMonitorBroadcastExclusions(user, channels) {
  if (!isDedicatedMonitorUser(user)) return channels;
  const excluded = getMonitorBroadcastExcludedChannelIds(user);
  if (excluded.size === 0) return channels;
  return channels.filter((channel) => channel?.id && !excluded.has(channel.id));
}

function isOrgAdminForChannel(user, channel) {
  if (!user || !channel || !isOrgAdmin(user)) return false;
  const org = user.organization?.trim();
  if (!org) return true;
  return matchesOrganization(org, channel.organization);
}

/** Matches Firestore canReadVoiceMessage — per-channel voice log read access. */
export function canReadVoiceMessageForChannel(user, channel) {
  if (!user || !channel) return false;
  if (canViewAllVoiceMessages(user)) return true;
  if (isChannelTalkMember(user, channel)) return true;
  if (isChannelNotificationMember(user, channel)) return true;
  if (isOrgAdminForChannel(user, channel)) return true;
  if (isLeadOrDirectorInOrg(user, channel)) return true;
  if (isMonitorForChannel(user, channel)) return true;
  return false;
}

/** Matches Firestore canAccessChannelAlerts — PTT signals, relay chunks. */
export function canAccessChannelAlertsForChannel(user, channel) {
  if (!user || !channel) return false;
  if (canViewAllVoiceMessages(user)) return true;
  if (isChannelNotificationMember(user, channel)) return true;
  if (isChannelTalkMember(user, channel)) return true;
  if (isOrgAdminForChannel(user, channel)) return true;
  if (isLeadOrDirectorInOrg(user, channel)) return true;
  if (isMonitorForChannel(user, channel)) return true;
  return false;
}

/** Matches Firestore canSendOnChannel — PTT claim, voice message create, relay chunks. */
export function canSendOnChannelForChannel(user, channel) {
  if (!user || !channel) return false;
  if (isMonitorBroadcastExcluded(user, channel.id)) return false;
  if (isPlatformAdmin(user)) return true;
  if ((user.member_of_channels || []).includes(channel.id)) return true;
  if (isChannelTalkMember(user, channel)) return true;
  if (isOrgAdminForChannel(user, channel)) return true;
  if (isLeadOrDirectorInOrg(user, channel)) return true;
  if (isMonitorForChannel(user, channel)) return true;
  return false;
}

export function canAccessChannel(user, channel) {
  if (!user || !channel) return false;
  if (isSuperAdmin(user)) return true;
  if (isOrgAdmin(user)) {
    return isOrgAdminForChannel(user, channel);
  }
  if (isLeadOrDirectorInOrg(user, channel)) return true;
  if (isMonitorForChannel(user, channel)) return true;
  return isChannelTalkMember(user, channel);
}

/** Matches Admin approvals — org admins or channel leads/directors on assigned channels. */
export function canManageChannelMembership(user, channel) {
  if (!user || !channel) return false;
  if (isSuperAdmin(user)) return true;
  if (isOrgAdmin(user)) return isOrgAdminForChannel(user, channel);
  return isChannelLeadForChannel(user, channel);
}

/** Matches Firestore canViewAllVoiceMessages — super_admin, lead, director, monitor roles. */
export function canViewAllVoiceMessages(user) {
  return (
    isSuperAdmin(user) ||
    isChannelLead(user) ||
    user?.role === "monitor" ||
    user?.is_monitor === true
  );
}

/** Monitor tab + multi-channel listen (includes org/platform admins). */
export function canAccessMonitorPage(user) {
  return canViewAllVoiceMessages(user) || isPlatformAdmin(user);
}

export function normalizeOrganization(value) {
  return (value || "").trim().toLowerCase();
}

/** Empty/missing target org is visible to scoped admins (matches Firestore channelOrgMatchesUser). */
export function matchesOrganization(adminOrg, targetOrg) {
  const scoped = normalizeOrganization(adminOrg);
  if (!scoped) return true;
  const target = normalizeOrganization(targetOrg);
  if (!target) return true;
  return scoped === target;
}

/** Org-scoped user list for Admin. Super admins and empty org => all users. */
export function filterUsersByOrganization(user, users) {
  if (!users?.length) return [];
  if (isSuperAdmin(user)) return users;
  const org = user?.organization?.trim();
  if (!org) return users;
  return users.filter((u) => matchesOrganization(org, u.organization));
}

/** Org-scoped channel list (matches Admin.jsx). Empty org => all channels. */
export function filterChannelsByOrganization(user, channels) {
  if (!channels?.length) return [];
  if (isSuperAdmin(user)) return channels;
  const org = user?.organization?.trim();
  if (!org) return channels;
  return channels.filter((c) => matchesOrganization(org, c.organization));
}

function isUserOnChannel(user, channel) {
  if (!user || !channel) return false;
  const members = channel.members || [];
  return members.includes(user.id) || (user.email && members.includes(user.email));
}

/** Channels a lead or director manages (assigned / org-scoped). */
export function getManagedChannels(user, channels) {
  if (!user || !channels?.length) return [];
  if (isSuperAdmin(user)) return channels;
  if (isPlatformAdmin(user)) return filterChannelsByOrganization(user, channels);
  return channels.filter((c) => canManageChannelMembership(user, c));
}

/** Users who are approved members of channels the lead/director manages. */
export function filterUsersInManagedChannels(manager, users, channels) {
  const managed = getManagedChannels(manager, channels);
  if (!managed.length || !users?.length) return [];
  return users.filter((u) => managed.some((ch) => isUserOnChannel(u, ch)));
}

/** Channels whose voiceMessages the user may list/subscribe to (matches Firestore query scope). */
export function getReadableVoiceChannels(user, channels) {
  if (!user?.id || !channels?.length) return [];

  if (isSuperAdmin(user)) {
    return channels.filter((c) => canReadVoiceMessageForChannel(user, c));
  }

  if (isPlatformAdmin(user)) {
    return filterChannelsByOrganization(user, channels).filter((c) =>
      canReadVoiceMessageForChannel(user, c)
    );
  }

  if (isChannelLead(user)) {
    return filterChannelsByOrganization(user, channels).filter((c) =>
      canReadVoiceMessageForChannel(user, c)
    );
  }

  if (user.role === "monitor" || user.is_monitor === true) {
    return filterChannelsByOrganization(user, channels).filter((c) =>
      canReadVoiceMessageForChannel(user, c)
    );
  }

  return channels.filter((c) => canReadVoiceMessageForChannel(user, c));
}

/** Channels visible on the Monitor page for the current user. */
export function getMonitorChannels(user, channels) {
  if (!user || !channels?.length) return [];

  let scoped = [];

  if (isSuperAdmin(user)) {
    scoped = channels;
  } else if (isChannelLead(user)) {
    scoped = filterChannelsByOrganization(user, channels);
  } else if (user.role === "monitor" || user.is_monitor === true) {
    scoped = filterChannelsByOrganization(user, channels);
  } else if (isOrgAdmin(user)) {
    scoped = filterChannelsByOrganization(user, channels);
  } else {
    scoped = channels.filter((channel) => isChannelTalkMember(user, channel));
  }

  // Dedicated monitors: all org channels except admin exclusions (default = full access).
  if (isDedicatedMonitorUser(user)) {
    return applyMonitorBroadcastExclusions(
      user,
      scoped.filter((channel) => isMonitorForChannel(user, channel))
    );
  }

  // Never query voiceMessages / relay for channels Firestore will reject.
  return applyMonitorBroadcastExclusions(
    user,
    scoped.filter((channel) => canAccessChannelAlertsForChannel(user, channel))
  );
}
