import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { LocalNotifications } from "@capacitor/local-notifications";
import { getToken, isSupported, onMessage } from "firebase/messaging";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { getFirebaseMessaging, db, auth } from "@/lib/firebase";
import { triggerRedAlert, ensureRedAlertNotificationChannel } from "@/lib/redAlertActions";
import { playTextMessageTone, playYellowProtectionTone } from "@/lib/pttTones";
import { isStaffAlertRecipient } from "@/lib/channelAlerts";
import {
  getOrCreateDeviceId,
  getPushRegistrationKey,
  getWebPushSurface,
  isMobileWebUserAgent,
  isPwaInstalled,
} from "@/lib/pushDevice";
import { removePushRegistration, upsertPushRegistration } from "@/lib/pushRegistrationStore";
import { beginSensitiveOperation, endSensitiveOperation } from "@/lib/sensitiveOperation";
import { clearNativeGoogleSignInPending } from "@/lib/logoutOnClose";
import { clearNativeTextMessageNotifications } from "@/lib/sessionGuardNative";
import { notificationIdForChannel } from "@/lib/textMessageNotifications";

const PUSH_CHANNEL_ID = "red_alerts";
const TEXT_MESSAGE_CHANNEL_ID = "text_messages";
const YELLOW_ALERT_CHANNEL_ID = "yellow_alerts";
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;
const NATIVE_PUSH_INIT_DELAY_MS = 2000;

let initialized = false;
let nativeListenersRegistered = false;
let currentUid = null;
let currentToken = null;
let currentRegistrationKey = null;
let staffAlertsEnabled = false;
let webMessageUnsub = null;
let textNotificationLifecycleInstalled = false;
let nativeAppInForeground = true;

function isAppInForeground() {
  if (Capacitor.isNativePlatform()) {
    return nativeAppInForeground;
  }
  return typeof document === "undefined" || document.visibilityState === "visible";
}

async function clearWebTextMessageNotifications() {
  if (Capacitor.isNativePlatform()) return;
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: "clear_text_message_notifications" });
  } catch {
    /* ignore */
  }
}

async function clearNativeTextMessageNotificationsFromTray() {
  await clearNativeTextMessageNotifications();
}

async function resetTextMessageUnreadCounts(uid) {
  if (!uid) return;
  try {
    await auth.authStateReady();
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    const data = snap.data() || {};
    const patch = { text_message_unread: {} };

    if (data.fcm_registrations && typeof data.fcm_registrations === "object") {
      const registrations = {};
      for (const [key, registration] of Object.entries(data.fcm_registrations)) {
        registrations[key] = {
          ...registration,
          text_message_unread: {},
        };
      }
      patch.fcm_registrations = registrations;
    } else if (currentRegistrationKey && data.fcm_registrations?.[currentRegistrationKey]) {
      patch.fcm_registrations = {
        ...data.fcm_registrations,
        [currentRegistrationKey]: {
          ...data.fcm_registrations[currentRegistrationKey],
          text_message_unread: {},
        },
      };
    }

    await updateDoc(userRef, patch);
  } catch (err) {
    console.warn("Failed to reset text message unread counts:", err);
    try {
      await updateDoc(doc(db, "users", uid), { text_message_unread: {} });
    } catch {
      /* ignore */
    }
  }
}

async function clearLocalTextMessageNotifications() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const delivered = await LocalNotifications.getDeliveredNotifications();
    const ids = (delivered?.notifications || [])
      .filter((notification) => notification?.extra?.type === "text_message")
      .map((notification) => ({ id: notification.id }));
    if (ids.length > 0) {
      await LocalNotifications.removeDeliveredNotifications({ notifications: ids });
    }
  } catch {
    /* ignore */
  }
}

async function clearAppIconBadge() {
  if ("clearAppBadge" in navigator) {
    try {
      await navigator.clearAppBadge();
    } catch {
      /* ignore */
    }
  }
}

/** Remove text-message push notifications and reset unread counts when the app opens. */
export async function clearTextMessageNotificationsOnForeground() {
  const uid = auth.currentUser?.uid || currentUid;
  if (!uid) {
    try {
      await auth.authStateReady();
    } catch {
      return;
    }
  }
  const resolvedUid = auth.currentUser?.uid || currentUid;
  await Promise.all([
    clearNativeTextMessageNotificationsFromTray(),
    clearLocalTextMessageNotifications(),
    clearWebTextMessageNotifications(),
    resetTextMessageUnreadCounts(resolvedUid),
    clearAppIconBadge(),
  ]);
}

function installTextMessageNotificationLifecycle() {
  if (textNotificationLifecycleInstalled) return;
  textNotificationLifecycleInstalled = true;

  const handleOpen = () => {
    void clearTextMessageNotificationsOnForeground();
  };

  if (Capacitor.isNativePlatform()) {
    nativeAppInForeground = true;
    window.addEventListener("pause", () => {
      nativeAppInForeground = false;
    });
    window.addEventListener("resume", () => {
      nativeAppInForeground = true;
      handleOpen();
    });
    window.addEventListener("focus", handleOpen);
    return;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      handleOpen();
    }
  });
  window.addEventListener("focus", handleOpen);
}

function handleRedAlertPayload(data) {
  const channelName = data?.channelName || data?.channel_name || "A channel";
  triggerRedAlert(channelName);
}

async function saveRegistration(uid, token, { surface, deviceId, staffAlerts }) {
  if (!uid || !token) return;

  const registrationKey = getPushRegistrationKey(surface, deviceId);
  currentRegistrationKey = registrationKey;

  await upsertPushRegistration(uid, registrationKey, {
    token,
    surface,
    deviceId,
    staff: staffAlerts,
    updatedAt: new Date().toISOString(),
  });
}

async function removeSessionRegistration(uid, registrationKey) {
  if (!uid || !registrationKey) return;
  try {
    await removePushRegistration(uid, registrationKey);
  } catch {
    /* ignore */
  }
}

function formatTextMessageBody(count, channelName) {
  const safeCount = Number.parseInt(String(count || "1"), 10);
  const normalizedCount = Number.isFinite(safeCount) && safeCount > 0 ? safeCount : 1;
  const label = normalizedCount === 1 ? "text message" : "text messages";
  return `${normalizedCount} new ${label} in ${channelName || "Channel"}`;
}

function shouldShowNativeForegroundNotification(type) {
  if (!Capacitor.isNativePlatform()) return true;
  // Android FCM already posts tray notifications; foreground should be tone-only.
  if (Capacitor.getPlatform() === "android") return false;
  // iOS: show a local banner while the app is open.
  return type !== "red_alert";
}

function stableNotificationId(tag, fallback = 50000) {
  let hash = 0;
  const value = String(tag || "notification");
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return (hash % 90000) + fallback;
}

async function showForegroundPushNotification({ title, body, tag, channelId, type, extra = {} }) {
  if (!shouldShowNativeForegroundNotification(type)) {
    return;
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const notificationId = type === "text_message"
        ? notificationIdForChannel(extra.channelId)
        : stableNotificationId(tag);
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notificationId,
            title,
            body,
            channelId,
            sound: "default",
            extra: { type, ...extra },
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
      new Notification(title, { body, tag, renotify: true, data: { type, ...extra } });
    } catch {
      /* ignore */
    }
  }
}

/** Show a tray notification for text messages when the app is not visible. */
export function notifyTextMessageInBackground({
  channelName = "Channel",
  channelId = "channel",
  count = 1,
} = {}) {
  if (isAppInForeground()) {
    return;
  }

  const tag = `text_message_${channelId}`;
  void showForegroundPushNotification({
    title: "Presence Torch",
    body: formatTextMessageBody(count, channelName),
    tag,
    channelId: TEXT_MESSAGE_CHANNEL_ID,
    type: "text_message",
    extra: { channelId, channelName },
  });
}

/** Foreground only on web/iOS — Android FCM/system tray handles visible notifications in background. */
function handleTextMessagePayload(data = {}) {
  playTextMessageTone();
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    return;
  }
  const channelName = data.channelName || data.channel_name || "Channel";
  const count = data.unreadCount || data.unread_count || "1";
  const channelId = data.channelId || data.channel_id || "channel";
  const tag = data.notificationTag || `text_message_${channelId}`;
  void showForegroundPushNotification({
    title: data.title || "Presence Torch",
    body: data.body || formatTextMessageBody(count, channelName),
    tag,
    channelId: TEXT_MESSAGE_CHANNEL_ID,
    type: "text_message",
    extra: { channelId, channelName },
  });
}

function handleYellowProtectionPayload(data = {}) {
  playYellowProtectionTone();
  const channelName = data.channelName || data.channel_name || "A channel";
  const channelId = data.channelId || data.channel_id || "all";
  const tag = data.notificationTag || `yellow_protection_${channelId}`;
  void showForegroundPushNotification({
    title: data.title || "YELLOW ALERT",
    body: data.body || `${channelName} level changed to YELLOW.`,
    tag,
    channelId: YELLOW_ALERT_CHANNEL_ID,
    type: "protection_level_yellow",
    extra: { channelId, channelName },
  });
}

async function registerNativePushListeners(uid) {
  if (nativeListenersRegistered) return;
  nativeListenersRegistered = true;

  await PushNotifications.addListener("registration", async (token) => {
    currentToken = token.value;
    const deviceId = await getOrCreateDeviceId();
    await saveRegistration(uid, token.value, {
      surface: "native",
      deviceId,
      staffAlerts: staffAlertsEnabled,
    });
  });

  await PushNotifications.addListener("registrationError", (err) => {
    console.error("Push registration error:", err);
  });

  await PushNotifications.addListener("pushNotificationReceived", (notification) => {
    const data = notification?.data || {};
    if (data.type === "red_alert") {
      handleRedAlertPayload(data);
      return;
    }
    if (data.type === "text_message") {
      handleTextMessagePayload(data);
      return;
    }
    if (data.type === "protection_level_yellow") {
      handleYellowProtectionPayload(data);
    }
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const data = action?.notification?.data || {};
    if (data.type === "red_alert") {
      handleRedAlertPayload(data);
      return;
    }
    if (data.type === "text_message" || data.type === "protection_level_yellow") {
      void clearTextMessageNotificationsOnForeground();
    }
  });
}

async function requestNativePushPermission() {
  beginSensitiveOperation();
  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt") {
      perm = await PushNotifications.requestPermissions();
    }
    return perm;
  } finally {
    endSensitiveOperation();
  }
}

async function registerNativeFcm(perm) {
  // Android can obtain an FCM token even when tray permission is still denied.
  if (Capacitor.getPlatform() === "android" || perm?.receive === "granted") {
    await PushNotifications.register();
  }
}

async function initNativePush(uid, userProfile) {
  try {
    await ensureRedAlertNotificationChannel();

    try {
      await LocalNotifications.createChannel({
        id: TEXT_MESSAGE_CHANNEL_ID,
        name: "Text Messages",
        importance: 4,
        vibration: true,
        sound: "default",
      });
      await LocalNotifications.createChannel({
        id: YELLOW_ALERT_CHANNEL_ID,
        name: "Yellow Alerts",
        importance: 5,
        vibration: true,
        sound: "default",
      });
    } catch {
      /* ignore */
    }

    try {
      await PushNotifications.createChannel({
        id: PUSH_CHANNEL_ID,
        name: "Red Alerts",
        importance: 5,
        vibration: true,
        visibility: 1,
        sound: "default",
      });
      await PushNotifications.createChannel({
        id: TEXT_MESSAGE_CHANNEL_ID,
        name: "Text Messages",
        importance: 4,
        vibration: true,
        visibility: 1,
        sound: "default",
      });
      await PushNotifications.createChannel({
        id: YELLOW_ALERT_CHANNEL_ID,
        name: "Yellow Alerts",
        importance: 5,
        vibration: true,
        visibility: 1,
        sound: "default",
      });
    } catch {
      /* ignore */
    }

    const perm = await requestNativePushPermission();
    try {
      await LocalNotifications.requestPermissions();
    } catch {
      /* ignore */
    }
    await registerNativeFcm(perm);
    void clearTextMessageNotificationsOnForeground();
  } catch (err) {
    console.error("Native push init failed:", err);
  } finally {
    clearNativeGoogleSignInPending();
  }
}

async function initWebPush(uid, userProfile) {
  if (!VAPID_KEY) {
    console.warn("[Push] VITE_FIREBASE_VAPID_KEY is not set; web push disabled.");
    return;
  }

  // Mobile browser tabs should use the installed PWA or native app instead.
  if (isMobileWebUserAgent() && !isPwaInstalled()) {
    return;
  }

  if (!(await isSupported())) return;

  if (!("Notification" in window)) return;

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return;

  const messaging = await getFirebaseMessaging();
  if (!messaging) return;

  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  if (!token) return;

  currentToken = token;
  const deviceId = await getOrCreateDeviceId();
  await saveRegistration(uid, token, {
    surface: getWebPushSurface(),
    deviceId,
    staffAlerts: staffAlertsEnabled,
  });

  if (webMessageUnsub) {
    webMessageUnsub();
    webMessageUnsub = null;
  }

  webMessageUnsub = onMessage(messaging, (payload) => {
    const data = payload?.data || {};
    if (data.type === "red_alert") {
      handleRedAlertPayload(data);
      return;
    }
    if (data.type === "text_message") {
      handleTextMessagePayload(data);
      return;
    }
    if (data.type === "protection_level_yellow") {
      handleYellowProtectionPayload(data);
    }
  });
}

function scheduleNativePushInit(uid, userProfile) {
  window.setTimeout(() => {
    void initNativePush(uid, userProfile);
  }, NATIVE_PUSH_INIT_DELAY_MS);
}

export async function initPushNotifications(uid, userProfile = null) {
  if (!uid) return;

  currentUid = uid;
  staffAlertsEnabled = isStaffAlertRecipient(userProfile);

  if (initialized) {
    if (currentToken && currentRegistrationKey) {
      const deviceId = await getOrCreateDeviceId();
      const surface = Capacitor.isNativePlatform() ? "native" : getWebPushSurface();
      await saveRegistration(uid, currentToken, {
        surface,
        deviceId,
        staffAlerts: staffAlertsEnabled,
      });
    } else if (Capacitor.isNativePlatform()) {
      void PushNotifications.register().catch(() => {});
    }
    return;
  }
  initialized = true;
  installTextMessageNotificationLifecycle();

  if (Capacitor.isNativePlatform()) {
    await registerNativePushListeners(uid);
    scheduleNativePushInit(uid, userProfile);
    return;
  }

  await initWebPush(uid, userProfile);
}

/** Refresh staff token registration when admin toggles staff alerts. */
export async function refreshStaffPushRegistration(uid, userProfile) {
  if (!uid || !currentToken || !currentRegistrationKey) return;

  staffAlertsEnabled = isStaffAlertRecipient(userProfile);
  const deviceId = await getOrCreateDeviceId();
  const surface = Capacitor.isNativePlatform() ? "native" : getWebPushSurface();

  await saveRegistration(uid, currentToken, {
    surface,
    deviceId,
    staffAlerts: staffAlertsEnabled,
  });
}

export async function teardownPushNotifications() {
  if (webMessageUnsub) {
    webMessageUnsub();
    webMessageUnsub = null;
  }

  if (currentUid && currentRegistrationKey) {
    await removeSessionRegistration(currentUid, currentRegistrationKey);
  }

  currentUid = null;
  currentToken = null;
  currentRegistrationKey = null;
  staffAlertsEnabled = false;
  initialized = false;
  nativeListenersRegistered = false;
  textNotificationLifecycleInstalled = false;
}

/** Re-register web push after PWA install (browser → standalone storage context). */
export async function refreshWebPushAfterInstall(uid, userProfile) {
  if (!uid || Capacitor.isNativePlatform()) return;

  initialized = false;
  currentToken = null;
  currentRegistrationKey = null;
  await initPushNotifications(uid, userProfile);
}
