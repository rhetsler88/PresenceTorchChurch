import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { LocalNotifications } from "@capacitor/local-notifications";
import { playRedAlert, stopRedAlertVibration } from "@/lib/pttTones";

const RED_ALERT_CHANNEL_ID = "red_alerts";
const RED_ALERT_NOTIFICATION_ID = 91001;
const ALERT_DEBOUNCE_MS = 8000;
let lastAlertAt = 0;
let hapticIntervalId = null;
let bannerHandler = null;

export function registerRedAlertBannerHandler(handler) {
  bannerHandler = handler;
}

export function dismissRedAlertEffects() {
  stopRedAlertVibration();
  if (hapticIntervalId) {
    clearInterval(hapticIntervalId);
    hapticIntervalId = null;
  }
}

async function vibrateNative() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await Haptics.vibrate({ duration: 1000 });
    hapticIntervalId = setInterval(async () => {
      try {
        await Haptics.impact({ style: ImpactStyle.Heavy });
      } catch {
        /* ignore */
      }
    }, 1500);
    setTimeout(() => {
      if (hapticIntervalId) {
        clearInterval(hapticIntervalId);
        hapticIntervalId = null;
      }
    }, 10000);
  } catch {
    /* ignore */
  }
}

function vibrateWeb() {
  if ("vibrate" in navigator) {
    navigator.vibrate([1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000]);
  }
}

async function showNotification(channelName) {
  const title = "RED ALERT";
  const body = `Code Red — ${channelName} — Secure Now`;

  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: RED_ALERT_NOTIFICATION_ID,
            title,
            body,
            channelId: RED_ALERT_CHANNEL_ID,
            sound: "default",
            extra: { type: "red_alert", channelName },
          },
        ],
      });
    } catch {
      /* ignore */
    }
    return;
  }

  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(title, { body });
    } catch {
      /* ignore */
    }
  }
}

export async function triggerRedAlert(channelName = "A channel") {
  const now = Date.now();
  if (now - lastAlertAt < ALERT_DEBOUNCE_MS) return;
  lastAlertAt = now;

  playRedAlert();
  bannerHandler?.(channelName);

  if (Capacitor.isNativePlatform()) {
    await vibrateNative();
  } else {
    vibrateWeb();
  }

  await showNotification(channelName);
}

export async function ensureRedAlertNotificationChannel() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await LocalNotifications.createChannel({
      id: RED_ALERT_CHANNEL_ID,
      name: "Red Alerts",
      importance: 5,
      vibration: true,
      sound: "default",
    });
  } catch {
    /* ignore */
  }
}

export async function requestRedAlertNotificationPermission() {
  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.requestPermissions();
    } catch {
      /* ignore */
    }
    return;
  }

  if ("Notification" in window && Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      /* ignore */
    }
  }
}
