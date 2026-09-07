import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { getDisplayName } from "@/lib/userUtils";
import { subscribeChannelPresence } from "@/lib/presence";

/**
 * Realtime list of users currently present on a channel (Discord-style).
 * Optionally includes the signed-in user while they are actively publishing here.
 */
export default function useChannelPresence(
  channelId,
  { enabled = true, includeCurrentUser = false } = {}
) {
  const { user } = useAuth();
  const [onlineMembers, setOnlineMembers] = useState([]);

  useEffect(() => {
    if (!enabled || !channelId) {
      setOnlineMembers([]);
      return undefined;
    }

    return subscribeChannelPresence(channelId, setOnlineMembers);
  }, [channelId, enabled]);

  const onlineMembersWithSelf = useMemo(() => {
    if (!includeCurrentUser || !user?.id || !channelId) return onlineMembers;

    if (onlineMembers.some((member) => member.userId === user.id)) {
      return onlineMembers;
    }

    return [
      ...onlineMembers,
      {
        userId: user.id,
        channelId,
        displayName: getDisplayName(user),
        lastActiveMs: Date.now(),
      },
    ];
  }, [onlineMembers, includeCurrentUser, user, channelId]);

  return {
    onlineMembers: onlineMembersWithSelf,
    onlineCount: onlineMembersWithSelf.length,
  };
}
