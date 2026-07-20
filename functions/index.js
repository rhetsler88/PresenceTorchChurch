const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getStorage } = require("firebase-admin/storage");
const speech = require("@google-cloud/speech");
const { RtcTokenBuilder, RtcRole } = require("agora-access-token");
const {
  buildRedAlertTokenSets,
  removeStaleTokensFromUserData,
} = require("./alertRecipients");

initializeApp();
setGlobalOptions({ region: "us-east5" });

const agoraAppId = defineSecret("AGORA_APP_ID");
const agoraAppCertificate = defineSecret("AGORA_APP_CERTIFICATE");

const THROTTLE_MS = 15000;
const VOICE_MESSAGE_RETENTION_DAYS = 20;
const CLEANUP_BATCH_SIZE = 500;

const SPEECH_CONFIG = {
  encoding: "WEBM_OPUS",
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

function storagePathFromAudioUrl(audioUrl) {
  const gcsUri = toGcsUri(audioUrl);
  if (!gcsUri) return null;
  return gcsUri.replace(/^gs:\/\/[^/]+\//, "");
}

async function cleanupOldVoiceMessages() {
  const db = getFirestore();
  const bucket = getStorage().bucket();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - VOICE_MESSAGE_RETENTION_DAYS);

  let deletedDocs = 0;
  let deletedFiles = 0;

  while (true) {
    const snap = await db
      .collection("voiceMessages")
      .where("created_date", "<", cutoff)
      .limit(CLEANUP_BATCH_SIZE)
      .get();

    if (snap.empty) break;

    const batch = db.batch();
    const fileDeletes = [];

    snap.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
      const storagePath = storagePathFromAudioUrl(docSnap.data().audio_url);
      if (storagePath) {
        fileDeletes.push(
          bucket
            .file(storagePath)
            .delete()
            .then(() => {
              deletedFiles += 1;
            })
            .catch(() => {})
        );
      }
    });

    await batch.commit();
    await Promise.all(fileDeletes);
    deletedDocs += snap.size;

    if (snap.size < CLEANUP_BATCH_SIZE) break;
  }

  console.log(
    `Voice message cleanup: removed ${deletedDocs} docs, ${deletedFiles} storage files (older than ${VOICE_MESSAGE_RETENTION_DAYS} days)`
  );
  return { deletedDocs, deletedFiles };
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

function agoraUidFromFirebaseId(firebaseUid) {
  if (!firebaseUid) return 0;
  let hash = 5381;
  for (let i = 0; i < firebaseUid.length; i++) {
    hash = (hash * 33) ^ firebaseUid.charCodeAt(i);
  }
  return Math.abs(hash >>> 0) % 2147483647 || 1;
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
    const clientUid = request.data?.client_uid;
    const uid = (
      typeof clientUid === "number"
      && Number.isFinite(clientUid)
      && clientUid > 0
      && clientUid < 2147483647
    )
      ? Math.floor(clientUid)
      : agoraUidFromFirebaseId(request.auth.uid);
    const expireTime = Math.floor(Date.now() / 1000) + 3600;
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      certificate,
      channelName,
      uid,
      RtcRole.PUBLISHER,
      expireTime
    );

    return {
      token,
      app_id: appId,
      channel_name: channelName,
      uid,
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
  const channelId = event.params.channelId;
  const usersSnap = await db.collection("users").get();
  const { channelTokens, staffTokens } = buildRedAlertTokenSets(usersSnap, after);
  const allTokens = [...new Set([...channelTokens, ...staffTokens])];

  const messaging = getMessaging();
  const chunkSize = 500;
  const staleTokens = new Set();

  const pushPayload = {
    notification: {
      title: "RED ALERT",
      body: `Code Red — ${channelName} — Secure Now`,
    },
    data: {
      type: "red_alert",
      channelName,
      channelId,
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
  };

  for (let i = 0; i < allTokens.length; i += chunkSize) {
    const chunk = allTokens.slice(i, i + chunkSize);
    const response = await messaging.sendEachForMulticast({
      tokens: chunk,
      ...pushPayload,
    });

    response.responses.forEach((result, index) => {
      if (result.success) return;
      const code = result.error?.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        staleTokens.add(chunk[index]);
      }
    });
  }

  if (staleTokens.size > 0) {
    const batch = db.batch();
    usersSnap.forEach((userDoc) => {
      const { data, changed } = removeStaleTokensFromUserData(userDoc.data(), staleTokens);
      if (!changed) return;
      const patch = {};
      if (data.fcm_tokens !== undefined) patch.fcm_tokens = data.fcm_tokens;
      if (data.staff_fcm_tokens !== undefined) patch.staff_fcm_tokens = data.staff_fcm_tokens;
      batch.update(userDoc.ref, patch);
    });
    await batch.commit();
  }

  await db.collection("alertLogs").add({
    type: "red_alert",
    channelId,
    channelName,
    channelTokenCount: channelTokens.length,
    staffTokenCount: staffTokens.length,
    createdAt: FieldValue.serverTimestamp(),
  });
});

exports.cleanupOldVoiceMessages = onSchedule(
  {
    schedule: "0 3 * * *",
    timeZone: "America/New_York",
  },
  async () => {
    await cleanupOldVoiceMessages();
  }
);
