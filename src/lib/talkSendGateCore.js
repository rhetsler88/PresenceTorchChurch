/** Pure Talk send gate — inject channel permission + daily-code checks (shared by PTT and text). */
export function canSendTextWithAccess(user, channel, access) {
  if (!access?.canSendOnChannel || !access?.bypassesDailyCode || !access?.isDailyCodeVerified) {
    return false;
  }
  return Boolean(
    channel
    && user
    && access.canSendOnChannel(user, channel)
    && (access.bypassesDailyCode(user) || access.isDailyCodeVerified(user))
  );
}

export function assertCanSendTextWithAccess(user, channel, access) {
  if (!channel || !user) {
    throw Object.assign(new Error("Could not send — try selecting the channel again"), {
      code: "app/no-channel",
    });
  }
  if (!access?.canSendOnChannel?.(user, channel)) {
    throw Object.assign(new Error("Permission denied"), { code: "permission-denied" });
  }
  if (!access.bypassesDailyCode(user) && !access.isDailyCodeVerified(user)) {
    throw Object.assign(new Error("Enter today's access code before sending messages"), {
      code: "daily-code-required",
    });
  }
}
