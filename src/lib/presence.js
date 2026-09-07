import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";

/** Heartbeat while the app is open (Discord-style ~1 write per minute per channel). */
export const PRESENCE_HEARTBEAT_MS = 60 * 1000;

/** Offline if no heartbeat within this window (slightly longer than heartbeat). */
export const PRESENCE_STALE_MS = 90 * 1000;

async function ensureAuthReady() {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    await user.getIdToken();
    return true;
  } catch {
    return false;
  }
}

function presenceDocId(userId, channelId) {
  return `${userId}_${channelId}`;
}

function presenceRef(userId, channelId) {
  return doc(db, "presence", presenceDocId(userId, channelId));
}

function readLastActiveMs(data) {
  if (!data) return null;
  if (typeof data.last_active_ms === "number" && Number.isFinite(data.last_active_ms)) {
    return data.last_active_ms;
  }
  const lastActiveAt = data.last_active_at;
  if (!lastActiveAt) return null;
  if (typeof lastActiveAt.toDate === "function") {
    return lastActiveAt.toDate().getTime();
  }
  const parsed = new Date(lastActiveAt).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function isPresenceFresh(data, nowMs = Date.now()) {
  const ts = readLastActiveMs(data);
  if (!ts) return false;
  return nowMs - ts <= PRESENCE_STALE_MS;
}

function mapPresenceDoc(docSnap) {
  const data = docSnap.data() || {};
  if (!isPresenceFresh(data)) return null;
  return {
    userId: data.user_id || docSnap.id.split("_")[0] || docSnap.id,
    channelId: data.channel_id || "",
    displayName: data.display_name || "",
    lastActiveAt: data.last_active_at,
    lastActiveMs: readLastActiveMs(data),
  };
}

/** Remove legacy single-doc presence rows (`presence/{uid}`). */
async function deleteLegacyPresenceDoc(uid) {
  await deleteDoc(doc(db, "presence", uid)).catch(() => {});
}

/**
 * Write or refresh presence for one or more channels (Talk: one, Monitor: many).
 * Removes presence docs for channels no longer in the list.
 */
export async function publishPresence({ channelIds = [], displayName = "" } = {}) {
  const uid = auth.currentUser?.uid;
  const uniqueChannelIds = [...new Set((channelIds || []).filter(Boolean))];
  if (!uid || !(await ensureAuthReady())) return;

  await deleteLegacyPresenceDoc(uid);

  if (uniqueChannelIds.length === 0) {
    await clearPresence();
    return;
  }

  const nowMs = Date.now();
  const existingSnap = await getDocs(
    query(collection(db, "presence"), where("user_id", "==", uid))
  );
  const targetSet = new Set(uniqueChannelIds);
  const batch = writeBatch(db);

  for (const channelId of uniqueChannelIds) {
    batch.set(
      presenceRef(uid, channelId),
      {
        user_id: uid,
        channel_id: channelId,
        display_name: displayName,
        last_active_at: serverTimestamp(),
        last_active_ms: nowMs,
      },
      { merge: true }
    );
  }

  for (const docSnap of existingSnap.docs) {
    const channelId = docSnap.data()?.channel_id;
    if (channelId && !targetSet.has(channelId)) {
      batch.delete(docSnap.ref);
    } else if (!channelId && docSnap.id === uid) {
      batch.delete(docSnap.ref);
    }
  }

  await batch.commit();
}

/** Remove all presence documents for the signed-in user. */
export async function clearPresence() {
  const uid = auth.currentUser?.uid;
  if (!uid || !(await ensureAuthReady())) return;

  const snap = await getDocs(
    query(collection(db, "presence"), where("user_id", "==", uid))
  );
  const batch = writeBatch(db);
  if (!snap.empty) {
    for (const docSnap of snap.docs) {
      batch.delete(docSnap.ref);
    }
  }
  batch.delete(doc(db, "presence", uid));
  await batch.commit().catch(() => {});
}

/**
 * Realtime listener for users currently present on a channel.
 * @returns {() => void} unsubscribe
 */
export function subscribeChannelPresence(channelId, onChange) {
  if (!channelId) {
    onChange([]);
    return () => {};
  }

  const q = query(
    collection(db, "presence"),
    where("channel_id", "==", channelId)
  );

  return onSnapshot(
    q,
    (snap) => {
      const members = snap.docs
        .map(mapPresenceDoc)
        .filter(Boolean);
      onChange(members);
    },
    (err) => {
      console.warn("[presence] subscribe failed:", err?.code || err);
      onChange([]);
    }
  );
}

/** @typedef {{ channelIds: string[], displayName?: string, enabled?: boolean }} PresenceRegistration */

const registrations = new Map();
let heartbeatTimer = null;
let foregroundListenersInstalled = false;
let authRetryListenerInstalled = false;
let publishInFlight = null;

function mergedPresencePayload() {
  const channelIds = new Set();
  let displayName = "";
  let enabled = false;

  for (const reg of registrations.values()) {
    if (!reg.enabled) continue;
    enabled = true;
    for (const channelId of reg.channelIds || []) {
      if (channelId) channelIds.add(channelId);
    }
    if (reg.displayName) displayName = reg.displayName;
  }

  return {
    enabled,
    displayName,
    channelIds: [...channelIds],
  };
}

export async function flushPresencePublish() {
  if (publishInFlight) return publishInFlight;

  publishInFlight = (async () => {
    const { enabled, displayName, channelIds } = mergedPresencePayload();
    if (!enabled || channelIds.length === 0) {
      await clearPresence();
      return;
    }
    await publishPresence({ channelIds, displayName });
  })().finally(() => {
    publishInFlight = null;
  });

  return publishInFlight;
}

function stopHeartbeat() {
  if (heartbeatTimer != null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    void flushPresencePublish();
  }, PRESENCE_HEARTBEAT_MS);
}

function isAppForeground() {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

function handleBackground() {
  stopHeartbeat();
  const { enabled, channelIds } = mergedPresencePayload();
  if (!enabled || channelIds.length === 0) {
    void clearPresence();
  }
}

function handleForeground() {
  void flushPresencePublish();
  startHeartbeat();
}

function ensureAuthRetryListener() {
  if (authRetryListenerInstalled) return;
  authRetryListenerInstalled = true;
  onAuthStateChanged(auth, () => {
    if (registrations.size > 0) {
      void flushPresencePublish();
      if (isAppForeground()) {
        startHeartbeat();
      }
    }
  });
}

function ensureForegroundListeners() {
  if (foregroundListenersInstalled || typeof document === "undefined") return;
  foregroundListenersInstalled = true;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      handleBackground();
    } else {
      handleForeground();
    }
  });

  if (typeof window !== "undefined") {
    window.addEventListener("pause", handleBackground);
    window.addEventListener("resume", handleForeground);
  }
}

/**
 * Register a presence source (Talk channel, Monitor listen set, app baseline).
 * Unregistering recomputes the merged set — does not clear unless nothing remains.
 */
export function registerPresenceSource(id, registration) {
  if (!id) return;
  registrations.set(id, {
    channelIds: registration?.channelIds || [],
    displayName: registration?.displayName || "",
    enabled: registration?.enabled !== false,
  });
  ensureForegroundListeners();
  ensureAuthRetryListener();
  if (isAppForeground()) {
    void flushPresencePublish();
    startHeartbeat();
  }
}

export function unregisterPresenceSource(id) {
  if (!id) return;
  registrations.delete(id);
  if (isAppForeground()) {
    void flushPresencePublish();
    if (registrations.size === 0) {
      stopHeartbeat();
    }
  }
}

export async function stopPresenceSession() {
  registrations.clear();
  stopHeartbeat();
  await clearPresence();
}

export function getRegisteredPresenceChannelIds() {
  return mergedPresencePayload().channelIds;
}
