const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getStorage } = require("firebase-admin/storage");
const speech = require("@google-cloud/speech");
const { RtcTokenBuilder, RtcRole } = require("agora-access-token");

initializeApp();
setGlobalOptions({ region: "us-east5" });

const agoraAppId = defineSecret("AGORA_APP_ID");
const agoraAppCertificate = defineSecret("AGORA_APP_CERTIFICATE");

const THROTTLE_MS = 15000;

const SPEECH_CONFIG = {
  encoding: "WEBM_OPUS",
  sampleRateHertz: 48000,
  languageCode: "en-US",
  enableAutomaticPunctuation: true,
};

function toGcsUri(audioUrl) {
  if (!audioUrl) return null;
  if (audioUrl.startsWith("gs://")) return audioUrl;

  if (audioUrl.startsWith("http")) {
    const firebaseMatch = audioUrl.match(/\/o\/([^?]+)/);
    if (firebaseMatch) {
      const bucket = getStorage().bucket();
      return `gs://${bucket.name}/${decodeURIComponent(firebaseMatch[1])}`;
    }
  }

  return null;
}

async function runSpeechToText(gcsUri) {
  const client = new speech.SpeechClient();

  try {
    const [operation] = await client.longRunningRecognize({
      audio: { uri: gcsUri },
      config: SPEECH_CONFIG,
    });
    const [response] = await operation.promise();
    return (response.results || [])
      .map((r) => r.alternatives?.[0]?.transcript || "")
      .join(" ")
      .trim();
  } catch (longErr) {
    console.warn("longRunningRecognize failed, trying sync recognize:", longErr.message);
    const bucket = getStorage().bucket();
    const path = gcsUri.replace(/^gs:\/\/[^/]+\//, "");
    const [buffer] = await bucket.file(path).download();
    const [response] = await client.recognize({
      audio: { content: buffer.toString("base64") },
      config: SPEECH_CONFIG,
    });
    return (response.results || [])
      .map((r) => r.alternatives?.[0]?.transcript || "")
      .join(" ")
      .trim();
  }
}

async function transcribeAndUpdate(messageId, audioUrl) {
  const db = getFirestore();
  const docRef = db.collection("voiceMessages").doc(messageId);
  const snap = await docRef.get();
  if (!snap.exists) return { skipped: true };

  const data = snap.data();
  if (data.is_transcribed || data.text_content) {
    return { transcript: data.transcript || data.text_content, skipped: true };
  }

  const gcsUri = toGcsUri(audioUrl || data.audio_url);
  let transcript = "[Transcription unavailable]";

  if (gcsUri) {
    try {
      const text = await runSpeechToText(gcsUri);
      transcript = text || "[No speech detected]";
    } catch (err) {
      console.error(`Transcription failed for ${messageId}:`, err);
    }
  }

  await docRef.update({ transcript, is_transcribed: true });
  return { transcript };
}

exports.transcribeOnVoiceMessage = onDocumentCreated(
  { document: "voiceMessages/{messageId}" },
  async (event) => {
    const data = event.data?.data();
    if (!data?.audio_url || data.text_content || data.is_transcribed) return;
    await transcribeAndUpdate(event.params.messageId, data.audio_url);
  }
);

exports.transcribeAudio = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }
  const { message_id, audio_url } = request.data || {};
  if (!message_id || !audio_url) {
    throw new HttpsError("invalid-argument", "message_id and audio_url are required");
  }
  return transcribeAndUpdate(message_id, audio_url);
});

function toAgoraChannelName(channelId) {
  const name = `ptc_${channelId}`.replace(/[^a-zA-Z0-9_\-!#$%&()+:;<=.>?@[\]^_{|}~, ]/g, "_");
  return name.slice(0, 64);
}

exports.getAgoraToken = onCall(
  { secrets: [agoraAppId, agoraAppCertificate] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required");
    }

    const channelId = request.data?.channel_id;
    if (!channelId || typeof channelId !== "string") {
      throw new HttpsError("invalid-argument", "channel_id is required");
    }

    const appId = agoraAppId.value();
    const certificate = agoraAppCertificate.value();
    if (!appId || !certificate) {
      throw new HttpsError("failed-precondition", "Agora is not configured on the server");
    }

    const channelName = toAgoraChannelName(channelId);
    const account = request.auth.uid;
    const expireTime = Math.floor(Date.now() / 1000) + 3600;
    const token = RtcTokenBuilder.buildTokenWithAccount(
      appId,
      certificate,
      channelName,
      account,
      RtcRole.PUBLISHER,
      expireTime
    );

    return {
      token,
      app_id: appId,
      channel_name: channelName,
      uid: account,
      expires_at: expireTime,
    };
  }
);

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
