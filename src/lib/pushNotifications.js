import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { triggerRedAlert, ensureRedAlertNotificationChannel } from "@/lib/redAlertActions";

const PUSH_CHANNEL_ID = "red_alerts";
let initialized = false;
let currentUid = null;
let currentToken = null;

async function saveToken(uid, token) {
  if (!uid || !token) return;
  const userRef = doc(db, "users", uid);
  await updateDoc(userRef, { fcm_tokens: arrayUnion(token) });
}

async function removeToken(uid, token) {
  if (!uid || !token) return;
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, { fcm_tokens: arrayRemove(token) });
  } catch {
    /* ignore */
  }
}

function handleRedAlertPayload(data) {
  const channelName = data?.channelName || data?.channel_name || "A channel";
  triggerRedAlert(channelName);
}

export async function initPushNotifications(uid) {
  if (!uid || !Capacitor.isNativePlatform()) return;

  currentUid = uid;

  if (initialized) {
    if (currentToken) await saveToken(uid, currentToken);
    return;
  }
  initialized = true;

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
  } catch {
    /* ignore */
  }

  await PushNotifications.addListener("registration", async (token) => {
    currentToken = token.value;
    await saveToken(uid, token.value);
  });

  await PushNotifications.addListener("registrationError", (err) => {
    console.error("Push registration error:", err);
  });

  await PushNotifications.addListener("pushNotificationReceived", (notification) => {
    const data = notification?.data || {};
    if (data.type === "red_alert") {
      handleRedAlertPayload(data);
    }
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const data = action?.notification?.data || {};
    if (data.type === "red_alert") {
      handleRedAlertPayload(data);
    }
  });

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt") {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive === "granted") {
    await PushNotifications.register();
  }
}

export async function teardownPushNotifications() {
  if (currentUid && currentToken) {
    await removeToken(currentUid, currentToken);
  }
  currentUid = null;
  currentToken = null;
}
