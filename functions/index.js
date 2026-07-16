const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
setGlobalOptions({ region: "us-east5" });

const THROTTLE_MS = 15000;

exports.sendRedAlertPush = onDocumentUpdated("channels/{channelId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  if (!before || !after) return;
  if (before.protection_level === "red" || after.protection_level !== "red") return;

  const db = getFirestore();
  const throttleRef = db.doc("system/alertThrottle");
  const throttleSnap = await throttleRef.get();
  const lastSentAt = throttleSnap.exists ? throttleSnap.data().lastSentAt || 0 : 0;
  const now = Date.now();

  if (now - lastSentAt < THROTTLE_MS) return;

  await throttleRef.set({ lastSentAt: now, channelId: event.params.channelId }, { merge: true });

  const channelName = after.name || "A channel";
  const usersSnap = await db.collection("users").get();
  const tokens = new Set();

  usersSnap.forEach((doc) => {
    const userTokens = doc.data().fcm_tokens;
    if (Array.isArray(userTokens)) {
      userTokens.forEach((token) => {
        if (typeof token === "string" && token.length > 0) tokens.add(token);
      });
    }
  });

  const tokenList = [...tokens];
  if (tokenList.length === 0) return;

  const messaging = getMessaging();
  const chunkSize = 500;

  for (let i = 0; i < tokenList.length; i += chunkSize) {
    const chunk = tokenList.slice(i, i + chunkSize);
    const response = await messaging.sendEachForMulticast({
      tokens: chunk,
      notification: {
        title: "RED ALERT",
        body: `Code Red — ${channelName} — Secure Now`,
      },
      data: {
        type: "red_alert",
        channelName,
      },
      android: {
        priority: "high",
        notification: {
          channelId: "red_alerts",
          sound: "default",
          defaultVibrateTimings: true,
          priority: "max",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            contentAvailable: true,
          },
        },
      },
    });

    const staleTokens = [];
    response.responses.forEach((result, index) => {
      if (result.success) return;
      const code = result.error?.code;
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
        staleTokens.push(chunk[index]);
      }
    });

    if (staleTokens.length > 0) {
      const batch = db.batch();
      usersSnap.forEach((userDoc) => {
        const userTokens = userDoc.data().fcm_tokens;
        if (!Array.isArray(userTokens)) return;
        const cleaned = userTokens.filter((t) => !staleTokens.includes(t));
        if (cleaned.length !== userTokens.length) {
          batch.update(userDoc.ref, { fcm_tokens: cleaned });
        }
      });
      await batch.commit();
    }
  }

  await db.collection("alertLogs").add({
    type: "red_alert",
    channelId: event.params.channelId,
    channelName,
    tokenCount: tokenList.length,
    createdAt: FieldValue.serverTimestamp(),
  });
});
