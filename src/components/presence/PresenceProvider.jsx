import React, { createContext, useContext, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import useChannels from "@/hooks/useChannels";
import { useAuth } from "@/lib/AuthContext";
import { usePassiveMonitor } from "@/components/monitor/PassiveMonitorProvider";
import { bypassesDailyCode, canAccessChannel, getDisplayName } from "@/lib/userUtils";
import { isDailyCodeVerified } from "@/lib/dailyCode";
import {
  registerPresenceSource,
  unregisterPresenceSource,
  stopPresenceSession,
  flushPresencePublish,
} from "@/lib/presence";

const APP_BASELINE_ID = "app-baseline";
const MONITOR_ID = "monitor";
const TALK_ID = "talk";

const PresenceRegistrationContext = createContext({
  setTalkChannelId: () => {},
});

function readLastChannelId() {
  try {
    return localStorage.getItem("lastChannelId") || "";
  } catch {
    return "";
  }
}

/**
 * App-wide Discord-style presence: publishes while Talk/Monitor/listen sessions
 * are active and subscribes to per-channel online counts from Firestore.
 */
export default function PresenceProvider({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const passiveMonitor = usePassiveMonitor();
  const talkChannelIdRef = useRef(null);

  const presenceEnabled = Boolean(
    user?.id && (bypassesDailyCode(user) || isDailyCodeVerified(user))
  );
  const displayName = user ? getDisplayName(user) : "";

  const { data: channels = [] } = useChannels({ enabled: presenceEnabled });

  useEffect(() => {
    if (!presenceEnabled) {
      stopPresenceSession();
      return undefined;
    }

    const lastChannelId = readLastChannelId();
    const lastChannel = channels.find((channel) => channel.id === lastChannelId) || null;
    const baselineChannelIds = lastChannel && canAccessChannel(user, lastChannel)
      ? [lastChannel.id]
      : [];

    registerPresenceSource(APP_BASELINE_ID, {
      channelIds: baselineChannelIds,
      displayName,
      enabled: baselineChannelIds.length > 0,
    });

    return () => {
      unregisterPresenceSource(APP_BASELINE_ID);
    };
  }, [presenceEnabled, displayName, user, channels, location.pathname]);

  useEffect(() => {
    if (!presenceEnabled) return undefined;

    const listenChannelIds = passiveMonitor?.listenChannelIds || [];

    registerPresenceSource(MONITOR_ID, {
      channelIds: listenChannelIds,
      displayName,
      enabled: listenChannelIds.length > 0,
    });

    return () => {
      unregisterPresenceSource(MONITOR_ID);
    };
  }, [
    presenceEnabled,
    displayName,
    passiveMonitor?.listenChannelIds?.join(","),
  ]);

  const setTalkChannelId = (channelId) => {
    talkChannelIdRef.current = channelId || null;
    if (!presenceEnabled) return;
    registerPresenceSource(TALK_ID, {
      channelIds: channelId ? [channelId] : [],
      displayName,
      enabled: Boolean(channelId),
    });
  };

  useEffect(() => {
    if (!presenceEnabled) return undefined;

    registerPresenceSource(TALK_ID, {
      channelIds: talkChannelIdRef.current ? [talkChannelIdRef.current] : [],
      displayName,
      enabled: Boolean(talkChannelIdRef.current),
    });

    return () => {
      unregisterPresenceSource(TALK_ID);
    };
  }, [presenceEnabled, displayName]);

  useEffect(() => {
    if (!user?.id) {
      void stopPresenceSession();
    }
  }, [user?.id]);

  useEffect(() => {
    if (!presenceEnabled) {
      void stopPresenceSession();
      return undefined;
    }

    void flushPresencePublish();
    return undefined;
  }, [presenceEnabled, displayName]);

  return (
    <PresenceRegistrationContext.Provider value={{ setTalkChannelId }}>
      {children}
    </PresenceRegistrationContext.Provider>
  );
}

export function useRegisterTalkPresence(channelId) {
  const { setTalkChannelId } = useContext(PresenceRegistrationContext);

  useEffect(() => {
    setTalkChannelId(channelId || null);
    return () => setTalkChannelId(null);
  }, [channelId, setTalkChannelId]);
}
