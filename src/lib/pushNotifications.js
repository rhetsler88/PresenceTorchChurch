import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { getToken, isSupported, onMessage } from "firebase/messaging";
import { doc, updateDoc } from "firebase/firestore";
import { getFirebaseMessaging, db, auth } from "@/lib/firebase";
import { triggerRedAlert, ensureRedAlertNotificationChannel } from "@/lib/redAlertActions";
import { playTextMessageTone } from "@/lib/pttTones";
import { isStaffAlertRecipient } from "@/lib/channelAlerts";
import {
  getOrCreateDeviceId,
  getPushRegistrationKey,
  getWebPushSurface,
} from "@/lib/pushDevice";
import { removePushRegistration, upsertPushRegistration } from "@/lib/pushRegistrationStore";
import { beginSensitiveOperation, endSensitiveOperation } from "@/lib/sensitiveOperation";
import { clearNativeGoogleSignInPending } from "@/lib/logoutOnClose";
import { clearNativeTextMessageNotifications } from "@/lib/sessionGuardNative";

const PUSH_CHANNEL_ID = "red_alerts";
const TEXT_MESSAGE_CHANNEL_ID = "text_messages";
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

async function clearWebTextMessageNotifications() {
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
    await updateDoc(doc(db, "users", uid), { text_message_unread: {} });
  } catch {
    /* ignore */
  }
}

/** Remove text-message push notifications and reset unread counts when the app opens. */
export async function clearTextMessageNotificationsOnForeground() {
  const uid = auth.currentUser?.uid || currentUid;
  await Promise.all([
    clearNativeTextMessageNotificationsFromTray(),
    clearWebTextMessageNotifications(),
    resetTextMessageUnreadCounts(uid),
  ]);
}

function installTextMessageNotificationLifecycle() {
  if (textNotificationLifecycleInstalled) return;
  textNotificationLifecycleInstalled = true;

  const handleOpen = () => {
    void clearTextMessageNotificationsOnForeground();
  };

  if (Capacitor.isNativePlatform()) {
    window.addEventListener("resume", handleOpen);
    return;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      handleOpen();
    }
  });
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

function handleTextMessagePayload(data) {
  playTextMessageTone();
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
    }
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const data = action?.notification?.data || {};
    if (data.type === "red_alert") {
      handleRedAlertPayload(data);
      return;
    }
    if (data.type === "text_message") {
      handleTextMessagePayload(data);
    }
  });
}

async function initNativePush(uid, userProfile) {
  try {
    await ensureRedAlertNotificationChannel();

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
    } catch {
      /* ignore */
    }

    await registerNativePushListeners(uid);

    beginSensitiveOperation();
    let perm;
    try {
      perm = await PushNotifications.checkPermissions();
      if (perm.receive === "prompt") {
        perm = await PushNotifications.requestPermissions();
      }
    } finally {
      endSensitiveOperation();
    }

    if (perm?.receive === "granted") {
      await PushNotifications.register();
    }
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
    }
    return;
  }
  initialized = true;
  installTextMessageNotificationLifecycle();
  void clearTextMessageNotificationsOnForeground();

  if (Capacitor.isNativePlatform()) {
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
