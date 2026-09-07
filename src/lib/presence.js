import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import {
  ref,
  onValue,
  onDisconnect,
  set,
  remove,
  get,
} from "firebase/database";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, rtdb } from "@/lib/firebase";

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

/** Online when synced from RTDB (Firestore doc has state online). */
export function isPresenceFresh(data) {
  return data?.state === "online";
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

function rtdbChannelsRef(userId) {
  return ref(rtdb, `presence/${userId}/channels`);
}

function rtdbChannelRef(userId, channelId) {
  return ref(rtdb, `presence/${userId}/channels/${channelId}`);
}

async function listRtdbChannelIds(userId) {
  const snap = await get(rtdbChannelsRef(userId)).catch(() => null);
  if (!snap?.exists()) return [];
  return Object.keys(snap.val() || {});
}

async function setRtdbChannelOnline(userId, channelId, displayName) {
  const channelRef = rtdbChannelRef(userId, channelId);
  await onDisconnect(channelRef).remove();
  await set(channelRef, {
    state: "online",
    user_id: userId,
    channel_id: channelId,
    display_name: displayName,
    last_changed: Date.now(),
  });
}

/**
 * Publish channel presence via RTDB onDisconnect (Firebase-recommended pattern).
 * A Cloud Function mirrors online rows into Firestore for channel queries.
 */
export async function publishPresence({ channelIds = [], displayName = "" } = {}) {
  const uid = auth.currentUser?.uid;
  const uniqueChannelIds = [...new Set((channelIds || []).filter(Boolean))];
  if (!uid || !(await ensureAuthReady())) return;

  if (uniqueChannelIds.length === 0) {
    await clearPresence();
    return;
  }

  const existingChannelIds = await listRtdbChannelIds(uid);
  const targetSet = new Set(uniqueChannelIds);

  for (const channelId of existingChannelIds) {
    if (!targetSet.has(channelId)) {
      await remove(rtdbChannelRef(uid, channelId)).catch(() => {});
    }
  }

  for (const channelId of uniqueChannelIds) {
    await setRtdbChannelOnline(uid, channelId, displayName);
  }
}

/** Remove all RTDB presence channels for the signed-in user. */
export async function clearPresence() {
  const uid = auth.currentUser?.uid;
  if (!uid || !(await ensureAuthReady())) return;
  await remove(rtdbChannelsRef(uid)).catch(() => {});
}

/**
 * Realtime listener for users currently present on a channel (Firestore mirror).
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
let connectedListenerInstalled = false;
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

function handleForeground() {
  void flushPresencePublish();
}

function ensureAuthRetryListener() {
  if (authRetryListenerInstalled) return;
  authRetryListenerInstalled = true;
  onAuthStateChanged(auth, () => {
    if (registrations.size > 0) {
      void flushPresencePublish();
    }
  });
}

function ensureRtdbConnectionListener() {
  if (connectedListenerInstalled) return;
  connectedListenerInstalled = true;

  onValue(ref(rtdb, ".info/connected"), (snap) => {
    if (snap.val() !== true) return;
    void flushPresencePublish();
  });
}

function ensureForegroundListeners() {
  if (typeof document === "undefined") return;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      handleForeground();
    }
  });

  if (typeof window !== "undefined") {
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
  ensureRtdbConnectionListener();
  ensureForegroundListeners();
  ensureAuthRetryListener();
  void flushPresencePublish();
}

export function unregisterPresenceSource(id) {
  if (!id) return;
  registrations.delete(id);
  void flushPresencePublish();
}

export async function stopPresenceSession() {
  registrations.clear();
  await clearPresence();
}

export function getRegisteredPresenceChannelIds() {
  return mergedPresencePayload().channelIds;
}
