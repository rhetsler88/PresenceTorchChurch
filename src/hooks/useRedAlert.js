import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/api/client";
import { playRedAlert } from "@/lib/pttTones";

export default function useRedAlert() {
  const [alertChannel, setAlertChannel] = useState(null);
  const prevLevels = useRef({});
  const alertTimeoutRef = useRef(null);

  const triggerAlert = useCallback((channelName) => {
    playRedAlert();
    setAlertChannel(channelName);

    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("🔴 RED ALERT", {
          body: "Protection Level Status now Red",
        });
      } catch {}
    }

    // Vibrate: 1s on, 500ms off, repeating for the alert duration
    if ("vibrate" in navigator) {
      navigator.vibrate([1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000]);
    }

    if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
    alertTimeoutRef.current = setTimeout(() => setAlertChannel(null), 10000);
  }, []);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    api.entities.Channel.list("-created_date", 50)
      .then(channels => {
        channels.forEach(c => { prevLevels.current[c.id] = c.protection_level; });
      })
      .catch(() => {});

    const unsub = api.entities.Channel.subscribe((event) => {
      if (event.type !== "update") return;
      const channelId = event.data?.id;
      const newLevel = event.data?.protection_level;
      const oldLevel = prevLevels.current[channelId];

      if (newLevel === "red" && oldLevel !== "red") {
        triggerAlert(event.data?.name || "A channel");
      }
      if (channelId) prevLevels.current[channelId] = newLevel;
    });

    return () => {
      unsub();
      if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
    };
  }, [triggerAlert]);

  const dismiss = useCallback(() => {
    if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
    setAlertChannel(null);
  }, []);

  return { alertChannel, dismiss };
}