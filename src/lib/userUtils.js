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

function isDirectorForChannel(user, channel) {
  if (!user || !channel || user.role !== "director") return false;
  const directed = user.directed_channels || [];
  if (directed.length > 0) return directed.includes(channel.id);
  const org = user.organization?.trim();
  if (!org) return true;
  return !channel.organization || channel.organization === org;
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
  return !channel.organization || channel.organization === org;
}

/** Matches Firestore canReadVoiceMessage — per-channel voice log read access. */
export function canReadVoiceMessageForChannel(user, channel) {
  if (!user || !channel) return false;
  if (canViewAllVoiceMessages(user)) return true;
  if (isChannelTalkMember(user, channel)) return true;
  if (isChannelNotificationMember(user, channel)) return true;
  if (isOrgAdminForChannel(user, channel)) return true;
  if (isDirectorForChannel(user, channel)) return true;
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
  if (isDirectorForChannel(user, channel)) return true;
  if (isMonitorForChannel(user, channel)) return true;
  return false;
}

/** Matches Firestore canSendOnChannel — PTT claim, voice message create, relay chunks. */
export function canSendOnChannelForChannel(user, channel) {
  if (!user || !channel) return false;
  if (isPlatformAdmin(user)) return true;
  if (isChannelTalkMember(user, channel)) return true;
  if (isOrgAdminForChannel(user, channel)) return true;
  if (isDirectorForChannel(user, channel)) return true;
  if (isMonitorForChannel(user, channel)) return true;
  return false;
}

export function canAccessChannel(user, channel) {
  if (!user || !channel) return false;
  if (isSuperAdmin(user)) return true;
  if (isOrgAdmin(user)) {
    return isOrgAdminForChannel(user, channel);
  }
  if (isDirectorForChannel(user, channel)) return true;
  if (isMonitorForChannel(user, channel)) return true;
  return isChannelTalkMember(user, channel);
}

/** Matches Firestore canViewAllVoiceMessages — super_admin, director, monitor roles. */
export function canViewAllVoiceMessages(user) {
  return (
    isSuperAdmin(user) ||
    user?.role === "director" ||
    user?.role === "monitor" ||
    user?.is_monitor === true
  );
}

/** Monitor tab + multi-channel listen (includes org/platform admins). */
export function canAccessMonitorPage(user) {
  return canViewAllVoiceMessages(user) || isPlatformAdmin(user);
}

/** Org-scoped channel list (matches Admin.jsx). Empty org => all channels. */
export function filterChannelsByOrganization(user, channels) {
  if (!channels?.length) return [];
  const org = user?.organization?.trim();
  if (!org) return channels;
  return channels.filter((c) => !c.organization || c.organization === org);
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

  if (user.role === "director") {
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
  } else if (user.role === "director") {
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
