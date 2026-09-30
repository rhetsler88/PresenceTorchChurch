function memberEntryMatches(userId, email, entry) {
  if (!entry || typeof entry !== "string") return false;
  if (userId && entry === userId) return true;
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return false;
  return entry.trim().toLowerCase() === normalizedEmail;
}

/**
 * Firestore patch payloads for self-leave or withdrawing a pending join request.
 * @param {{ channel: { id: string, members?: string[], pending_members?: string[] }, userId?: string, email?: string, intent: 'leave' | 'withdraw' }} params
 * @returns {{ channel: Record<string, string[]>, user: { member_of_channels: { remove: string } } | null }}
 */
export function leaveChannelUpdates({ channel, userId, email, intent }) {
  if (!channel?.id) {
    throw new Error("channel.id is required");
  }

  if (intent === "withdraw") {
    const pending = channel.pending_members || [];
    return {
      channel: {
        pending_members: pending.filter(
          (entry) => !memberEntryMatches(userId, email, entry)
        ),
      },
      user: null,
    };
  }

  const members = channel.members || [];
  return {
    channel: {
      members: members.filter((entry) => !memberEntryMatches(userId, email, entry)),
    },
    user: {
      member_of_channels: { remove: channel.id },
    },
  };
}

export { memberEntryMatches };
