import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/api/client";
import {
  triggerRedAlert,
  registerRedAlertBannerHandler,
  dismissRedAlertEffects,
  requestRedAlertNotificationPermission,
} from "@/lib/redAlertActions";

export default function useRedAlert() {
  const [alertChannel, setAlertChannel] = useState(null);
  const prevLevels = useRef({});
  const alertTimeoutRef = useRef(null);

  const showBanner = useCallback((channelName) => {
    setAlertChannel(channelName);
    if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
    alertTimeoutRef.current = setTimeout(() => setAlertChannel(null), 10000);
  }, []);

  useEffect(() => {
    registerRedAlertBannerHandler(showBanner);
    requestRedAlertNotificationPermission();
  }, [showBanner]);

  useEffect(() => {
    api.entities.Channel.list("-created_date", 50)
      .then((channels) => {
        channels.forEach((c) => { prevLevels.current[c.id] = c.protection_level; });
      })
      .catch(() => {});

    const unsub = api.entities.Channel.subscribe((event) => {
      if (event.type !== "update") return;
      const channelId = event.data?.id;
      const newLevel = event.data?.protection_level;
      const oldLevel = prevLevels.current[channelId];

      if (newLevel === "red" && oldLevel !== "red") {
        triggerRedAlert(event.data?.name || "A channel");
      }
      if (channelId) prevLevels.current[channelId] = newLevel;
    });

    return () => {
      unsub();
      if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
      registerRedAlertBannerHandler(null);
    };
  }, []);

  const dismiss = useCallback(() => {
    if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
    dismissRedAlertEffects();
    setAlertChannel(null);
  }, []);

  return { alertChannel, dismiss };
}
