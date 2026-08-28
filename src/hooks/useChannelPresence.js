import { useEffect, useState } from "react";
import { subscribeChannelPresence } from "@/lib/presence";

/**
 * Realtime list of users currently present on a channel.
 */
export default function useChannelPresence(channelId, { enabled = true } = {}) {
  const [onlineMembers, setOnlineMembers] = useState([]);

  useEffect(() => {
    if (!enabled || !channelId) {
      setOnlineMembers([]);
      return undefined;
    }

    return subscribeChannelPresence(channelId, setOnlineMembers);
  }, [channelId, enabled]);

  return {
    onlineMembers,
    onlineCount: onlineMembers.length,
  };
}
