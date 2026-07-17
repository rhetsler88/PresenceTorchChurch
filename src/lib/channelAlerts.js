/** User id or email appears in a channel member list field. */
export function isListedOnChannel(userId, email, list = []) {
  if (!list?.length) return false;
  if (userId && list.includes(userId)) return true;
  if (email && list.includes(email)) return true;
  return false;
}

export function isChannelTalkMember(user, channel) {
  if (!user || !channel) return false;
  return isListedOnChannel(user.id, user.email, channel.members);
}

export function isChannelNotificationMember(user, channel) {
  if (!user || !channel) return false;
  return isListedOnChannel(user.id, user.email, channel.notification_members);
}

/** Full PTT member or notifications-only subscriber — receives Code Red for this channel. */
export function receivesChannelRedAlert(user, channel) {
  return isChannelTalkMember(user, channel) || isChannelNotificationMember(user, channel);
}

export function isStaffAlertRecipient(user) {
  if (!user) return false;
  return user.receives_staff_alerts === true;
}
