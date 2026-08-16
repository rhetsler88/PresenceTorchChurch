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
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  if (user.full_name?.trim()) return user.full_name.trim();
  return "Unknown";
}

/**
 * Returns initials from a display name string ("Jane Doe" → "JD", "Jane" → "JA").
 */
export function getInitialsFromName(name) {
  const trimmed = name?.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

/**
 * Returns initials from first/last name (e.g. "Jane" + "Doe" → "JD").
 * Falls back to the first two letters of first name when no last name is set.
 */
export function getInitials(user) {
  if (!user) return "?";
  const first = user.first_name?.trim();
  const last = user.last_name?.trim();
  if (first && last) return (first[0] + last[0]).toUpperCase();
  if (first) return first.slice(0, 2).toUpperCase();
  if (last) return last.slice(0, 2).toUpperCase();
  if (user.full_name?.trim()) return getInitialsFromName(user.full_name);
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

export function isLead(user) {
  return user?.role === "lead";
}

export function isChannelLead(user) {
  return isLead(user) || isDirector(user);
}

/** Roles a director may assign to members of their channels. */
export const DIRECTOR_ASSIGNABLE_ROLES = ["user", "monitor", "lead", "director"];

/** Platform admins and directors may assign roles (directors: channel members only). */
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

function isChannelLeadForChannel(user, channel) {
  if (!user || !channel) return false;
  if (user.role !== "lead" && user.role !== "director") return false;
  const directed = user.directed_channels || [];
  if (directed.length > 0) return directed.includes(channel.id);
  const org = user.organization?.trim();
  if (!org) return true;
  return !channel.organization || channel.organization === org;
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
  if (isChannelLeadForChannel(user, channel)) return true;
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
  if (isChannelLeadForChannel(user, channel)) return true;
  if (isMonitorForChannel(user, channel)) return true;
  return false;
}

/** Matches Firestore canSendOnChannel — PTT claim, voice message create, relay chunks. */
export function canSendOnChannelForChannel(user, channel) {
  if (!user || !channel) return false;
  if (isPlatformAdmin(user)) return true;
  if ((user.member_of_channels || []).includes(channel.id)) return true;
  if (isChannelTalkMember(user, channel)) return true;
  if (isOrgAdminForChannel(user, channel)) return true;
  if (isChannelLeadForChannel(user, channel)) return true;
  if (isMonitorForChannel(user, channel)) return true;
  return false;
}

export function canAccessChannel(user, channel) {
  if (!user || !channel) return false;
  if (isSuperAdmin(user)) return true;
  if (isOrgAdmin(user)) {
    return isOrgAdminForChannel(user, channel);
  }
  if (isChannelLeadForChannel(user, channel)) return true;
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
    const directed = user.directed_channels || [];
    const scoped = directed.length > 0
      ? channels.filter((c) => directed.includes(c.id))
      : filterChannelsByOrganization(user, channels);
    return scoped.filter((c) => canReadVoiceMessageForChannel(user, c));
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
    const directed = user.directed_channels || [];
    scoped = directed.length > 0
      ? channels.filter((c) => directed.includes(c.id))
      : filterChannelsByOrganization(user, channels);
  } else if (user.role === "monitor" || user.is_monitor === true) {
    scoped = filterChannelsByOrganization(user, channels);
  } else if (isOrgAdmin(user)) {
    scoped = filterChannelsByOrganization(user, channels);
  } else {
    scoped = channels.filter((channel) => isChannelTalkMember(user, channel));
  }

  // Never query voiceMessages / relay for channels Firestore will reject.
  return scoped.filter((channel) => canAccessChannelAlertsForChannel(user, channel));
}
