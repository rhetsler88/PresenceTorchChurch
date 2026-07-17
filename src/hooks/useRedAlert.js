import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/api/client";
import { receivesChannelRedAlert, isStaffAlertRecipient } from "@/lib/channelAlerts";
import {
  triggerRedAlert,
  registerRedAlertBannerHandler,
  dismissRedAlertEffects,
  requestRedAlertNotificationPermission,
} from "@/lib/redAlertActions";

export default function useRedAlert(user) {
  const [alertChannel, setAlertChannel] = useState(null);
  const prevLevels = useRef({});
  const channelsRef = useRef([]);
  const alertTimeoutRef = useRef(null);

  const showBanner = useCallback((channelName) => {
    setAlertChannel(channelName);
    if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
    alertTimeoutRef.current = setTimeout(() => setAlertChannel(null), 10000);
  }, []);

  const shouldAlertForChannel = useCallback(
    (channelData) => {
      if (!user?.id || !channelData) return false;
      if (receivesChannelRedAlert(user, channelData)) return true;
      if (isStaffAlertRecipient(user)) return true;
      return false;
    },
    [user]
  );

  useEffect(() => {
    registerRedAlertBannerHandler(showBanner);
    requestRedAlertNotificationPermission();
  }, [showBanner]);

  useEffect(() => {
    api.entities.Channel.list("-created_date", 50)
      .then((channels) => {
        channelsRef.current = channels;
        channels.forEach((c) => {
          prevLevels.current[c.id] = c.protection_level;
        });
      })
      .catch(() => {});

    const unsub = api.entities.Channel.subscribe((event) => {
      if (event.type !== "update") return;
      const channelId = event.data?.id;
      const newLevel = event.data?.protection_level;
      const oldLevel = prevLevels.current[channelId];

      if (newLevel === "red" && oldLevel !== "red") {
        const channelData =
          channelsRef.current.find((c) => c.id === channelId) || event.data;
        if (shouldAlertForChannel(channelData)) {
          triggerRedAlert(event.data?.name || channelData?.name || "A channel");
        }
      }
      if (channelId) prevLevels.current[channelId] = newLevel;

      if (event.type === "update" || event.type === "create") {
        const idx = channelsRef.current.findIndex((c) => c.id === channelId);
        if (idx >= 0) channelsRef.current[idx] = { ...channelsRef.current[idx], ...event.data };
        else if (channelId) channelsRef.current.push(event.data);
      }
    });

    return () => {
      unsub();
      if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
      registerRedAlertBannerHandler(null);
    };
  }, [shouldAlertForChannel]);

  return {
    alertChannel,
    dismiss: useCallback(() => {
      if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
      dismissRedAlertEffects();
      setAlertChannel(null);
    }, []),
  };
}
