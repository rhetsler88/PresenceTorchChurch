const { onDocumentUpdated, onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getStorage } = require("firebase-admin/storage");
const speech = require("@google-cloud/speech");
const { google } = require("googleapis");
const { RtcTokenBuilder, RtcRole } = require("agora-access-token");
const {
  buildRedAlertTokenSets,
  buildTextMessageRecipients,
  buildYellowProtectionTokens,
  removeStaleTokensFromUserData,
} = require("./alertRecipients");
const {
  rotateAllDailyCodes,
  verifyDailyAccessCode,
  getDailyAccessCodeForUser,
  getCodeDateKey,
  writeSystemDailyCodeDateKey,
  dailyCodeValidityPatch,
} = require("./dailyCode");
const {
  syncMemberProfilesForChannel,
  backfillAllChannelMemberships,
  backfillMissingUserEmails,
  repairUserAccess,
  syncChannelAccessForAuthUser,
  diagnoseUserAccess,
  assertModeratorRole,
  approveChannelMember,
  removeChannelMember,
  rejectChannelMember,
} = require("./channelMembership");
const { logProtectionLevelChange } = require("./protectionLevelHistory");

initializeApp();
setGlobalOptions({ region: "us-east5" });

/** Callable options: public invoker + CORS for localhost dev and web clients. */
const CALLABLE_OPTIONS = { cors: true, invoker: "public" };

const agoraAppId = defineSecret("AGORA_APP_ID");
const agoraAppCertificate = defineSecret("AGORA_APP_CERTIFICATE");
const recaptchaSecretKey = defineSecret("RECAPTCHA_SECRET_KEY");

const THROTTLE_MS = 15000;
const YELLOW_BATCH_WAIT_MS = 800;
const VOICE_MESSAGE_RETENTION_DAYS = 10;
const CLEANUP_BATCH_SIZE = 500;

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

  if (audioUrl.startsWith("audio/")) {
    const bucket = getStorage().bucket();
    return `gs://${bucket.name}/${audioUrl}`;
  }

  return null;
}

function resolveStoragePath(audioUrl) {
  const gcsUri = toGcsUri(audioUrl);
  if (!gcsUri) return null;
  return gcsUri.replace(/^gs:\/\/[^/]+\//, "");
}

const SPEECH_TRY_CONFIGS = [
  { encoding: "WEBM_OPUS", languageCode: "en-US", enableAutomaticPunctuation: true },
  { encoding: "OGG_OPUS", languageCode: "en-US", enableAutomaticPunctuation: true },
  { encoding: "MP3", languageCode: "en-US", enableAutomaticPunctuation: true },
];

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
      const storagePath = resolveStoragePath(docSnap.data().audio_url);
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

async function runSpeechToText(storagePath) {
  if (!storagePath) {
    throw new Error("Missing storage path for transcription");
  }

  const bucket = getStorage().bucket();
  const gcsUri = `gs://${bucket.name}/${storagePath}`;
  const client = new speech.SpeechClient();

  // Auto-detect container/codec from GCS (handles MP4/AAC, WebM, etc.).
  try {
    const [operation] = await client.longRunningRecognize({
      audio: { uri: gcsUri },
      config: {
        languageCode: "en-US",
        enableAutomaticPunctuation: true,
      },
    });
    const [response] = await operation.promise();
    const text = (response.results || [])
      .map((r) => r.alternatives?.[0]?.transcript || "")
      .join(" ")
      .trim();
    if (text) return text;
  } catch (err) {
    console.warn("longRunningRecognize (auto-detect) failed:", err.message);
  }

  const [buffer] = await bucket.file(storagePath).download();
  const audioContent = buffer.toString("base64");

  for (const config of SPEECH_TRY_CONFIGS) {
    try {
      const [response] = await client.recognize({
        audio: { content: audioContent },
        config,
      });
      const text = (response.results || [])
        .map((r) => r.alternatives?.[0]?.transcript || "")
        .join(" ")
        .trim();
      if (text) return text;
    } catch (err) {
      console.warn(`recognize failed (${config.encoding}):`, err.message);
    }
  }

  return "";
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

  const storagePath = resolveStoragePath(audioUrl || data.audio_url);
  let transcript = "[Transcription unavailable]";

  if (storagePath) {
    try {
      const text = await runSpeechToText(storagePath);
      transcript = text || "[No speech detected]";
    } catch (err) {
      console.error(`Transcription failed for ${messageId}:`, err);
    }
  } else {
    console.error(`Transcription skipped — could not resolve storage path`, {
      messageId,
      audioUrl: audioUrl || data.audio_url,
    });
  }

  await docRef.update({ transcript, is_transcribed: true });
  return { transcript };
}

async function applyAuthClaims(uid, data) {
  if (!data) return;
  const role = typeof data.role === "string" ? data.role : "user";
  const is_monitor = data.is_monitor === true || role === "monitor";
  await getAuth().setCustomUserClaims(uid, { role, is_monitor });
}

exports.syncUserAuthClaims = onDocumentWritten("users/{userId}", async (event) => {
  const after = event.data?.after;
  if (!after?.exists) {
    try {
      await getAuth().setCustomUserClaims(event.params.userId, null);
    } catch (_) {
      // user may already be deleted
    }
    return;
  }
  await applyAuthClaims(event.params.userId, after.data());
});

/** Keep users/{uid}.member_of_channels in sync when channel.members changes. */
exports.syncChannelMembershipProfiles = onDocumentWritten(
  "channels/{channelId}",
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const beforeMembers = event.data?.before?.exists
      ? event.data.before.data()?.members || []
      : [];
    const afterMembers = after.data()?.members || [];

    if (JSON.stringify(beforeMembers) === JSON.stringify(afterMembers)) return;

    const db = getFirestore();
    const updated = await syncMemberProfilesForChannel(
      db,
      getAuth(),
      event.params.channelId,
      beforeMembers,
      afterMembers
    );
    if (updated > 0) {
      console.log("syncChannelMembershipProfiles", {
        channelId: event.params.channelId,
        profilesUpdated: updated,
      });
    }
  }
);

exports.backfillChannelMemberships = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }

  const db = getFirestore();
  const callerSnap = await db.collection("users").doc(request.auth.uid).get();
  const role = callerSnap.data()?.role || "user";
  if (role !== "admin" && role !== "super_admin") {
    throw new HttpsError("permission-denied", "Admin access required");
  }

  return backfillAllChannelMemberships(db, getAuth());
});

exports.backfillMissingUserEmails = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }

  const db = getFirestore();
  const callerSnap = await db.collection("users").doc(request.auth.uid).get();
  const role = callerSnap.data()?.role || "user";
  if (role !== "admin" && role !== "super_admin") {
    throw new HttpsError("permission-denied", "Admin access required");
  }

  return backfillMissingUserEmails(db, getAuth());
});

exports.syncMyChannelAccess = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }

  const db = getFirestore();
  const userSnap = await db.collection("users").doc(request.auth.uid).get();
  const email = request.auth.token.email || userSnap.data()?.email || "";

  return syncChannelAccessForAuthUser(db, getAuth(), request.auth.uid, email);
});

exports.approveChannelMember = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }

  const { channelId, memberId } = request.data || {};
  if (!channelId || typeof channelId !== "string") {
    throw new HttpsError("invalid-argument", "channelId is required");
  }
  if (!memberId || typeof memberId !== "string") {
    throw new HttpsError("invalid-argument", "memberId is required");
  }

  const db = getFirestore();
  const email = request.auth.token.email || "";
  try {
    return await approveChannelMember(
      db,
      getAuth(),
      request.auth.uid,
      email,
      channelId,
      memberId
    );
  } catch (err) {
    const code = err?.code;
    if (code === "invalid-argument" || code === "not-found" || code === "permission-denied") {
      throw new HttpsError(code, err.message);
    }
    console.error("approveChannelMember failed:", err);
    throw new HttpsError("internal", "Could not approve channel member");
  }
});

exports.removeChannelMember = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }

  const { channelId, memberId } = request.data || {};
  if (!channelId || typeof channelId !== "string") {
    throw new HttpsError("invalid-argument", "channelId is required");
  }
  if (!memberId || typeof memberId !== "string") {
    throw new HttpsError("invalid-argument", "memberId is required");
  }

  const db = getFirestore();
  const email = request.auth.token.email || "";
  try {
    return await removeChannelMember(
      db,
      getAuth(),
      request.auth.uid,
      email,
      channelId,
      memberId
    );
  } catch (err) {
    const code = err?.code;
    if (code === "invalid-argument" || code === "not-found" || code === "permission-denied") {
      throw new HttpsError(code, err.message);
    }
    console.error("removeChannelMember failed:", err);
    throw new HttpsError("internal", "Could not remove channel member");
  }
});

exports.rejectChannelMember = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }

  const { channelId, memberId } = request.data || {};
  if (!channelId || typeof channelId !== "string") {
    throw new HttpsError("invalid-argument", "channelId is required");
  }
  if (!memberId || typeof memberId !== "string") {
    throw new HttpsError("invalid-argument", "memberId is required");
  }

  const db = getFirestore();
  const email = request.auth.token.email || "";
  try {
    return await rejectChannelMember(
      db,
      getAuth(),
      request.auth.uid,
      email,
      channelId,
      memberId
    );
  } catch (err) {
    const code = err?.code;
    if (code === "invalid-argument" || code === "not-found" || code === "permission-denied") {
      throw new HttpsError(code, err.message);
    }
    console.error("rejectChannelMember failed:", err);
    throw new HttpsError("internal", "Could not reject channel member");
  }
});

exports.diagnoseUserAccess = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }

  const email = request.data?.email;
  if (!email || typeof email !== "string") {
    throw new HttpsError("invalid-argument", "email is required");
  }

  const db = getFirestore();
  const callerSnap = await db.collection("users").doc(request.auth.uid).get();
  const role = callerSnap.data()?.role || "user";
  if (role !== "admin" && role !== "super_admin") {
    throw new HttpsError("permission-denied", "Admin access required");
  }

  return diagnoseUserAccess(db, getAuth(), email, { getCodeDateKey });
});

exports.repairUserAccess = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }

  const email = request.data?.email;
  if (!email || typeof email !== "string") {
    throw new HttpsError("invalid-argument", "email is required");
  }

  const db = getFirestore();
  const callerSnap = await db.collection("users").doc(request.auth.uid).get();
  const role = callerSnap.data()?.role || "user";
  if (role !== "admin" && role !== "super_admin") {
    throw new HttpsError("permission-denied", "Admin access required");
  }

  try {
    return await repairUserAccess(db, getAuth(), email, {
      getCodeDateKey,
      writeSystemDailyCodeDateKey,
      dailyCodeValidityPatch,
    });
  } catch (err) {
    const code = err?.code;
    if (code === "invalid-argument" || code === "not-found") {
      throw new HttpsError(code, err.message);
    }
    if (code === "auth/user-not-found") {
      throw new HttpsError("not-found", "No Firebase Auth account for that email");
    }
    console.error("repairUserAccess failed:", err);
    throw new HttpsError("internal", "Could not repair user access");
  }
});

exports.refreshMyAuthClaims = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }
  const snap = await getFirestore().collection("users").doc(request.auth.uid).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "User profile not found");
  }
  await applyAuthClaims(request.auth.uid, snap.data());
  return { role: snap.data().role || "user" };
});

exports.deleteVoiceMessages = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }

  const messageIds = request.data?.messageIds;
  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    throw new HttpsError("invalid-argument", "messageIds is required");
  }
  if (messageIds.length > 100) {
    throw new HttpsError("invalid-argument", "Too many messages");
  }
  if (!messageIds.every((id) => typeof id === "string" && id.length > 0)) {
    throw new HttpsError("invalid-argument", "Invalid message id");
  }

  const db = getFirestore();
  const email = request.auth.token.email || "";
  try {
    await assertModeratorRole(db, request.auth.uid, email);
  } catch (err) {
    if (err?.code === "permission-denied") {
      throw new HttpsError("permission-denied", err.message);
    }
    throw err;
  }

  const userSnap = await db.collection("users").doc(request.auth.uid).get();
  await applyAuthClaims(request.auth.uid, userSnap.data());

  const batch = db.batch();
  for (const messageId of messageIds) {
    batch.delete(db.collection("voiceMessages").doc(messageId));
  }
  await batch.commit();

  return { deleted: messageIds.length };
});

async function verifyRecaptchaResponse(token, remoteIp) {
  const secret = recaptchaSecretKey.value();
  if (!secret) {
    throw new HttpsError("failed-precondition", "reCAPTCHA is not configured on the server");
  }

  const params = new URLSearchParams({ secret, response: token });
  if (remoteIp) params.set("remoteip", remoteIp);

  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new HttpsError("internal", "reCAPTCHA verification request failed");
  }

  const data = await response.json();
  if (!data.success) {
    throw new HttpsError("permission-denied", "reCAPTCHA verification failed");
  }

  return data;
}

exports.verifyRecaptcha = onCall(
  { ...CALLABLE_OPTIONS, secrets: [recaptchaSecretKey] },
  async (request) => {
    const token = request.data?.token;
    if (!token || typeof token !== "string") {
      throw new HttpsError("invalid-argument", "reCAPTCHA token is required");
    }

    await verifyRecaptchaResponse(token, request.rawRequest?.ip);
    return { success: true };
  }
);

const DELETE_BATCH_SIZE = 400;
const CHANNEL_MEMBER_FIELDS = [
  "members",
  "pending_members",
  "notification_members",
  "pending_notification_members",
];

async function commitBatchDeletes(db, docRefs) {
  if (!docRefs.length) return;
  for (let i = 0; i < docRefs.length; i += DELETE_BATCH_SIZE) {
    const batch = db.batch();
    docRefs.slice(i, i + DELETE_BATCH_SIZE).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

async function deleteDocsByField(db, collectionName, field, value, { deleteStorage = false } = {}) {
  const bucket = deleteStorage ? getStorage().bucket() : null;
  let deleted = 0;

  while (true) {
    const snap = await db
      .collection(collectionName)
      .where(field, "==", value)
      .limit(DELETE_BATCH_SIZE)
      .get();
    if (snap.empty) break;

    const refs = [];
    const fileDeletes = [];

    snap.docs.forEach((docSnap) => {
      refs.push(docSnap.ref);
      if (deleteStorage) {
        const storagePath = resolveStoragePath(docSnap.data().audio_url);
        if (storagePath) {
          fileDeletes.push(
            bucket
              .file(storagePath)
              .delete()
              .catch(() => {})
          );
        }
      }
    });

    await commitBatchDeletes(db, refs);
    await Promise.all(fileDeletes);
    deleted += snap.size;

    if (snap.size < DELETE_BATCH_SIZE) break;
  }

  return deleted;
}

async function removeUserFromAllChannels(db, uid, email) {
  const channelsSnap = await db.collection("channels").get();
  let batch = db.batch();
  let ops = 0;
  let updated = 0;

  for (const channelDoc of channelsSnap.docs) {
    const data = channelDoc.data() || {};
    const updates = {};

    for (const field of CHANNEL_MEMBER_FIELDS) {
      const arr = data[field] || [];
      const filtered = arr.filter((entry) => entry !== uid && (!email || entry !== email));
      if (filtered.length !== arr.length) {
        updates[field] = filtered;
      }
    }

    if (Object.keys(updates).length === 0) continue;

    batch.update(channelDoc.ref, updates);
    ops += 1;
    updated += 1;

    if (ops >= DELETE_BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();
  return updated;
}

async function deleteUserAccount(uid) {
  const db = getFirestore();
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const email = userSnap.exists ? userSnap.data()?.email || null : null;

  const channelsUpdated = await removeUserFromAllChannels(db, uid, email);

  const [voiceMessages, pttSignals, audioChunksBySender, audioChunksByCreator, contacts] =
    await Promise.all([
      deleteDocsByField(db, "voiceMessages", "created_by_id", uid, { deleteStorage: true }),
      deleteDocsByField(db, "pttSignals", "sender_id", uid),
      deleteDocsByField(db, "audioChunks", "sender_id", uid),
      deleteDocsByField(db, "audioChunks", "created_by_id", uid),
      deleteDocsByField(db, "contacts", "created_by_id", uid),
    ]);

  const userDocIds = new Set([uid]);
  if (email) {
    const emailSnap = await db.collection("users").where("email", "==", email).get();
    emailSnap.docs.forEach((docSnap) => userDocIds.add(docSnap.id));
  }

  await commitBatchDeletes(
    db,
    [...userDocIds].map((id) => db.collection("users").doc(id))
  );

  try {
    await getAuth().deleteUser(uid);
  } catch (err) {
    if (err?.code !== "auth/user-not-found") throw err;
  }

  return {
    success: true,
    channelsUpdated,
    voiceMessages,
    pttSignals,
    audioChunks: audioChunksBySender + audioChunksByCreator,
    contacts,
    userDocsDeleted: userDocIds.size,
  };
}

function normalizeOrg(value) {
  return (value || "").trim().toLowerCase();
}

function orgsMatch(adminOrg, targetOrg) {
  const scoped = normalizeOrg(adminOrg);
  if (!scoped) return true;
  const target = normalizeOrg(targetOrg);
  if (!target) return true;
  return scoped === target;
}

async function assertCanAdminDeleteUser(callerUid, targetUid) {
  if (callerUid === targetUid) {
    throw new HttpsError("permission-denied", "You cannot delete your own account");
  }

  const db = getFirestore();
  const [callerSnap, targetSnap] = await Promise.all([
    db.collection("users").doc(callerUid).get(),
    db.collection("users").doc(targetUid).get(),
  ]);

  if (!callerSnap.exists) {
    throw new HttpsError("permission-denied", "Not allowed");
  }

  const callerRole = callerSnap.data()?.role;
  if (callerRole !== "admin" && callerRole !== "super_admin") {
    throw new HttpsError("permission-denied", "Admin access required");
  }

  if (!targetSnap.exists) {
    throw new HttpsError("not-found", "User not found");
  }

  const targetData = targetSnap.data();
  const targetRole = targetData?.role;

  if (callerRole === "super_admin") {
    return targetData;
  }

  if (targetRole === "super_admin") {
    throw new HttpsError("permission-denied", "Cannot delete super admin");
  }

  if (!orgsMatch(callerSnap.data()?.organization, targetData?.organization)) {
    throw new HttpsError("permission-denied", "Cannot delete users outside your organization");
  }

  return targetData;
}

exports.deleteUserAccount = onCall(
  { ...CALLABLE_OPTIONS, timeoutSeconds: 300, memory: "512MiB" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required");
    }

    try {
      return await deleteUserAccount(request.auth.uid);
    } catch (err) {
      console.error("deleteUserAccount failed:", err);
      throw new HttpsError("internal", "Failed to delete account");
    }
  }
);

exports.adminDeleteUser = onCall(
  { ...CALLABLE_OPTIONS, timeoutSeconds: 300, memory: "512MiB" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required");
    }

    const targetUserId = request.data?.targetUserId;
    if (!targetUserId || typeof targetUserId !== "string") {
      throw new HttpsError("invalid-argument", "targetUserId is required");
    }

    try {
      await assertCanAdminDeleteUser(request.auth.uid, targetUserId);
      return await deleteUserAccount(targetUserId);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error("adminDeleteUser failed:", err);
      throw new HttpsError("internal", "Failed to delete user");
    }
  }
);

// Transcription runs on replay or log export only — not on voice message create.
exports.transcribeOnVoiceMessage = onDocumentCreated(
  { document: "voiceMessages/{messageId}" },
  async () => {}
);

function formatTextMessageNotificationBody(count, channelName) {
  const safeCount = Number.isFinite(count) && count > 0 ? count : 1;
  const label = safeCount === 1 ? "text message" : "text messages";
  return `${safeCount} new ${label} in ${channelName}`;
}

async function incrementTextMessageUnreadCount(db, userId, channelId, channelName) {
  const userRef = db.collection("users").doc(userId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const data = snap.data() || {};
    const unread = data.text_message_unread || {};
    const entry = unread[channelId] || { count: 0, channelName };
    const count = (entry.count || 0) + 1;
    unread[channelId] = {
      count,
      channelName: channelName || entry.channelName || "Channel",
    };
    tx.set(userRef, { text_message_unread: unread }, { merge: true });
    return count;
  });
}

function buildTextMessagePushMessage({ token, channelId, channelName, messageId, count }) {
  const body = formatTextMessageNotificationBody(count, channelName);
  const tag = `text_message_${channelId}`;
  const title = "Presence Torch";

  return {
    token,
    data: {
      type: "text_message",
      channelId,
      channelName,
      messageId,
      unreadCount: String(count),
      notificationTag: tag,
      title,
      body,
    },
    android: {
      priority: "high",
      collapseKey: tag,
      notification: {
        channelId: "text_messages",
        tag,
        title,
        body,
        notificationCount: count,
        sound: "default",
        defaultVibrateTimings: true,
        priority: "high",
      },
    },
    apns: {
      payload: {
        aps: {
          alert: {
            title: "Presence Torch",
            body,
          },
          sound: "default",
          "thread-id": tag,
        },
      },
    },
    webpush: {
      notification: {
        title: "Presence Torch",
        body,
        icon: "https://app.presencetorch.net/icons/icon-192.png",
        tag,
      },
      fcmOptions: {
        link: "https://app.presencetorch.net/",
      },
    },
  };
}

function buildYellowProtectionPushMessage({ token, label, channelId = "all" }) {
  const body = `${label} level changed to YELLOW.`;
  const tag = channelId === "all" ? "yellow_protection_all" : `yellow_protection_${channelId}`;
  const title = "YELLOW ALERT";

  return {
    token,
    data: {
      type: "protection_level_yellow",
      channelId,
      channelName: label,
      title,
      body,
      notificationTag: tag,
    },
    android: {
      priority: "high",
      collapseKey: tag,
      notification: {
        channelId: "yellow_alerts",
        tag,
        title,
        body,
        sound: "default",
        defaultVibrateTimings: true,
        priority: "high",
      },
    },
    apns: {
      payload: {
        aps: {
          alert: {
            title,
            body,
          },
          sound: "default",
          "thread-id": tag,
        },
      },
    },
    webpush: {
      notification: {
        title,
        body,
        icon: "https://app.presencetorch.net/icons/icon-192.png",
        tag,
      },
      fcmOptions: {
        link: "https://app.presencetorch.net/",
      },
    },
  };
}

async function incrementYellowPushCoordinator(db, channelId, channelName) {
  const ref = db.doc("system/yellowPushCoordinator");
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    if (data.sent) return { skip: true };

    const count = (data.count || 0) + 1;
    tx.set(
      ref,
      {
        count,
        firstChannelId: data.firstChannelId || channelId,
        firstChannelName: data.firstChannelName || channelName,
        windowStart: data.windowStart || Date.now(),
        sent: false,
      },
      { merge: true }
    );
    return { skip: false, count };
  });
}

async function claimYellowPushSend(db) {
  const ref = db.doc("system/yellowPushCoordinator");
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!data || data.sent) return null;

    tx.set(ref, { sent: true }, { merge: true });

    if (data.count >= 2) {
      return { scope: "all", label: "All Channels", channelId: "all" };
    }

    return {
      scope: "channel",
      label: data.firstChannelName || "A channel",
      channelId: data.firstChannelId || "channel",
    };
  });
}

async function sendYellowProtectionMulticast(db, messaging, usersSnap, tokens, pushMeta) {
  if (tokens.length === 0) return;

  const chunkSize = 500;
  const staleTokens = new Set();
  const messages = tokens.map((token) =>
    buildYellowProtectionPushMessage({
      token,
      label: pushMeta.label,
      channelId: pushMeta.channelId,
    })
  );

  for (let i = 0; i < messages.length; i += chunkSize) {
    const chunk = messages.slice(i, i + chunkSize);
    const response = await messaging.sendEach(chunk);

    response.responses.forEach((result, index) => {
      if (result.success) return;
      const code = result.error?.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        staleTokens.add(chunk[index].token);
      }
    });
  }

  if (staleTokens.size > 0) {
    const batch = db.batch();
    usersSnap.forEach((userDoc) => {
      const { data, changed } = removeStaleTokensFromUserData(userDoc.data(), staleTokens);
      if (!changed) return;
      const patch = {};
      if (data.fcm_registrations !== undefined) patch.fcm_registrations = data.fcm_registrations;
      if (data.fcm_tokens !== undefined) patch.fcm_tokens = data.fcm_tokens;
      if (data.staff_fcm_tokens !== undefined) patch.staff_fcm_tokens = data.staff_fcm_tokens;
      batch.update(userDoc.ref, patch);
    });
    await batch.commit();
  }

  await db.collection("alertLogs").add({
    type: "protection_level_yellow",
    scope: pushMeta.scope,
    channelId: pushMeta.channelId,
    label: pushMeta.label,
    sentAt: FieldValue.serverTimestamp(),
    tokenCount: tokens.length,
  });
}

exports.sendTextMessagePush = onDocumentCreated(
  { document: "voiceMessages/{messageId}" },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const data = snapshot.data();
    if (!data?.text_content || data?.audio_url) return;
    if (data.message_type === "protection_level_change") return;

    const channelId = data.channel_id;
    const senderId = data.created_by_id || data.sender_id;
    if (!channelId || !senderId) return;

    const db = getFirestore();
    const channelSnap = await db.collection("channels").doc(channelId).get();
    if (!channelSnap.exists) return;

    const channelData = channelSnap.data() || {};
    const channelName = channelData.name || "Channel";

    const usersSnap = await db.collection("users").get();
    const recipients = buildTextMessageRecipients(usersSnap, channelData, senderId);
    if (recipients.length === 0) return;

    const messaging = getMessaging();
    const chunkSize = 500;
    const staleTokens = new Set();
    const messages = [];

    for (const recipient of recipients) {
      const count = await incrementTextMessageUnreadCount(
        db,
        recipient.userId,
        channelId,
        channelName
      );

      for (const token of recipient.tokens) {
        messages.push(
          buildTextMessagePushMessage({
            token,
            channelId,
            channelName,
            messageId: event.params.messageId,
            count,
          })
        );
      }
    }

    for (let i = 0; i < messages.length; i += chunkSize) {
      const chunk = messages.slice(i, i + chunkSize);
      const response = await messaging.sendEach(chunk);

      response.responses.forEach((result, index) => {
        if (result.success) return;
        const code = result.error?.code;
        if (
          code === "messaging/registration-token-not-registered"
          || code === "messaging/invalid-registration-token"
        ) {
          staleTokens.add(chunk[index].token);
        }
      });
    }

    if (staleTokens.size > 0) {
      const batch = db.batch();
      usersSnap.forEach((doc) => {
        const { data: cleaned, changed } = removeStaleTokensFromUserData(
          doc.data(),
          staleTokens
        );
        if (changed) batch.update(doc.ref, cleaned);
      });
      await batch.commit();
    }
  }
);

exports.transcribeAudio = onCall(CALLABLE_OPTIONS, async (request) => {
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
  { ...CALLABLE_OPTIONS, secrets: [agoraAppId, agoraAppCertificate] },
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

exports.recordProtectionLevelHistory = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }

  const channelId = request.data?.channel_id;
  const fromLevel = request.data?.from_level || "green";
  const toLevel = request.data?.to_level || "green";

  if (!channelId || typeof channelId !== "string") {
    throw new HttpsError("invalid-argument", "channel_id is required");
  }
  if (fromLevel === toLevel) {
    return { ok: true, skipped: true };
  }

  try {
    await logProtectionLevelChange(getFirestore(), channelId, fromLevel, toLevel, {
      device_time: request.data?.device_time,
      device_date: request.data?.device_date,
    });
    return { ok: true };
  } catch (err) {
    console.error("recordProtectionLevelHistory failed:", err);
    throw new HttpsError("internal", "Could not record protection level history");
  }
});

exports.sendYellowProtectionPush = onDocumentUpdated("channels/{channelId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  if (!before || !after) return;
  if (before.protection_level === "yellow" || after.protection_level !== "yellow") return;

  const db = getFirestore();
  const channelId = event.params.channelId;
  const channelName = after.name || "A channel";
  const increment = await incrementYellowPushCoordinator(db, channelId, channelName);
  if (increment.skip) return;

  await new Promise((resolve) => setTimeout(resolve, YELLOW_BATCH_WAIT_MS));

  const pushMeta = await claimYellowPushSend(db);
  if (!pushMeta) return;

  const usersSnap = await db.collection("users").get();
  const messaging = getMessaging();
  let tokens = [];

  if (pushMeta.scope === "all") {
    const channelsSnap = await db.collection("channels").get();
    tokens = buildYellowProtectionTokens(usersSnap, null, { allChannels: true, channelsSnap });
  } else {
    tokens = buildYellowProtectionTokens(usersSnap, after);
  }

  await sendYellowProtectionMulticast(db, messaging, usersSnap, tokens, pushMeta);
  await db.doc("system/yellowPushCoordinator").delete().catch(() => {});
});

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
    data: {
      type: "red_alert",
      channelName,
      channelId,
      title: "RED ALERT",
      body: `Code Red — ${channelName} — Secure Now`,
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
    webpush: {
      notification: {
        title: "RED ALERT",
        body: `Code Red — ${channelName} — Secure Now`,
        icon: "https://app.presencetorch.net/icons/icon-192.png",
      },
      fcmOptions: {
        link: "https://app.presencetorch.net/",
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
      if (data.fcm_registrations !== undefined) patch.fcm_registrations = data.fcm_registrations;
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
    region: "us-central1",
  },
  async () => {
    await cleanupOldVoiceMessages();
  }
);

async function assertCanExportTranscripts(uid) {
  const snap = await getFirestore().collection("users").doc(uid).get();
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "Not allowed");
  }
  const role = snap.data()?.role;
  if (role !== "admin" && role !== "super_admin" && role !== "director") {
    throw new HttpsError("permission-denied", "Export requires admin or director role");
  }
}

async function transcribeBatchByIds(messageIds) {
  const db = getFirestore();
  const transcripts = {};
  /** @type {Map<string, string[]>} */
  const pendingByAudioUrl = new Map();

  for (const messageId of messageIds) {
    if (!messageId || typeof messageId !== "string") continue;
    const snap = await db.collection("voiceMessages").doc(messageId).get();
    if (!snap.exists) continue;

    const data = snap.data();
    if (data.text_content) {
      transcripts[messageId] = data.text_content;
      continue;
    }
    if (data.is_transcribed || data.transcript) {
      transcripts[messageId] = data.transcript || "[No speech detected]";
      continue;
    }
    if (!data.audio_url) continue;

    const bucket = pendingByAudioUrl.get(data.audio_url) || [];
    bucket.push(messageId);
    pendingByAudioUrl.set(data.audio_url, bucket);
  }

  for (const [audioUrl, ids] of pendingByAudioUrl) {
    const primaryId = ids[0];
    const result = await transcribeAndUpdate(primaryId, audioUrl);
    const text = result?.transcript || "[Transcription unavailable]";
    transcripts[primaryId] = text;

    for (let i = 1; i < ids.length; i += 1) {
      const siblingId = ids[i];
      await db.collection("voiceMessages").doc(siblingId).update({
        transcript: text,
        is_transcribed: true,
      });
      transcripts[siblingId] = text;
    }
  }

  return transcripts;
}

exports.transcribeBatch = onCall(
  { ...CALLABLE_OPTIONS, timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required");
    }
    await assertCanExportTranscripts(request.auth.uid);

    const { message_ids: messageIds } = request.data || {};
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      throw new HttpsError("invalid-argument", "message_ids array is required");
    }
    if (messageIds.length > 200) {
      throw new HttpsError("invalid-argument", "Too many messages (max 200 per export batch)");
    }

    const transcripts = await transcribeBatchByIds(messageIds);
    return { transcripts };
  }
);

exports.exportTranscriptsToGoogleDoc = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }
  await assertCanExportTranscripts(request.auth.uid);

  const { title, content, shareEmail } = request.data || {};
  if (!content || typeof content !== "string") {
    throw new HttpsError("invalid-argument", "content is required");
  }
  if (content.length > 500000) {
    throw new HttpsError("invalid-argument", "Export is too large");
  }

  const email = (shareEmail || request.auth.token.email || "").trim();
  if (!email) {
    throw new HttpsError("invalid-argument", "No email address to share the document with");
  }

  try {
    const auth = new google.auth.GoogleAuth({
      scopes: [
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/drive",
      ],
    });
    const authClient = await auth.getClient();
    const docs = google.docs({ version: "v1", auth: authClient });
    const drive = google.drive({ version: "v3", auth: authClient });

    const docTitle =
      typeof title === "string" && title.trim()
        ? title.trim().slice(0, 200)
        : `Presence Torch Transcript Log — ${new Date().toISOString().slice(0, 10)}`;

    const created = await docs.documents.create({
      requestBody: { title: docTitle },
    });
    const documentId = created.data.documentId;
    if (!documentId) {
      throw new Error("Google Docs did not return a document id");
    }

    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: content,
            },
          },
        ],
      },
    });

    await drive.permissions.create({
      fileId: documentId,
      requestBody: {
        type: "user",
        role: "writer",
        emailAddress: email,
      },
      sendNotificationEmail: false,
    });

    return {
      documentId,
      url: `https://docs.google.com/document/d/${documentId}/edit`,
    };
  } catch (err) {
    console.error("exportTranscriptsToGoogleDoc failed:", err);
    const detail =
      err?.response?.data?.error?.message
      || err?.errors?.[0]?.message
      || err?.message
      || "Unknown error";
    throw new HttpsError(
      "failed-precondition",
      `Google Doc export failed: ${detail}. Cloud Functions service accounts cannot create Drive files — use in-app export (user Google sign-in) instead.`
    );
  }
});

function mapDailyCodeError(err) {
  const code = err?.code || "internal";
  const message = err?.message || "Daily access code request failed";
  if (code === "permission-denied" || code === "unauthenticated" || code === "invalid-argument"
    || code === "failed-precondition" || code === "not-found" || code === "resource-exhausted") {
    throw new HttpsError(code, message);
  }
  throw new HttpsError("internal", message);
}

exports.rotateDailyAccessCodes = onSchedule(
  {
    schedule: "1 0 * * *",
    timeZone: "America/New_York",
    region: "us-central1",
  },
  async () => {
    const db = getFirestore();
    const result = await rotateAllDailyCodes(db);
    console.log("rotateDailyAccessCodes", result);
  }
);

exports.verifyDailyAccessCode = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }

  try {
    const db = getFirestore();
    return await verifyDailyAccessCode(db, request.auth.uid, request.data?.code);
  } catch (err) {
    mapDailyCodeError(err);
  }
});

exports.getDailyAccessCode = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }

  try {
    const db = getFirestore();
    const userSnap = await db.collection("users").doc(request.auth.uid).get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "User profile not found");
    }
    return await getDailyAccessCodeForUser(db, userSnap.data());
  } catch (err) {
    mapDailyCodeError(err);
  }
});
