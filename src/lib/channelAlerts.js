/** User id or email appears in a channel member list field. */
export function isListedOnChannel(userId, email, list = []) {
  if (!list?.length) return false;
  if (userId && list.includes(userId)) return true;
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return false;
  return list.some(
    (entry) => typeof entry === "string" && entry.trim().toLowerCase() === normalizedEmail
  );
}

export function isChannelTalkMember(user, channel) {
  if (!user || !channel) return false;
  if ((user.member_of_channels || []).includes(channel.id)) return true;
  return isListedOnChannel(user.id, user.email, channel.members);
}

export function isChannelNotificationMember(user, channel) {
  if (!user || !channel) return false;
  return isListedOnChannel(user.id, user.email, channel.notification_members);
}

/** Full PTT member — receives Code Red for this channel when in app / push. */
export function receivesChannelRedAlert(user, channel) {
  return isChannelTalkMember(user, channel);
}

export function isStaffAlertRecipient(user) {
  if (!user) return false;
  return user.receives_staff_alerts === true;
}
