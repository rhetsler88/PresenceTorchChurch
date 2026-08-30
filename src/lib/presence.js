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
import { auth, db } from "@/lib/firebase";

/** Heartbeat interval while the app is foreground on a channel. */
export const PRESENCE_HEARTBEAT_MS = 15 * 60 * 1000;

/** Treat presence as offline after this long without an update. */
export const PRESENCE_STALE_MS = 16 * 60 * 1000;

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

function isPresenceFresh(lastActiveAt) {
  if (!lastActiveAt) return false;
  const ts = typeof lastActiveAt.toDate === "function"
    ? lastActiveAt.toDate().getTime()
    : new Date(lastActiveAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= PRESENCE_STALE_MS;
}

function mapPresenceDoc(docSnap) {
  const data = docSnap.data() || {};
  const lastActiveAt = data.last_active_at;
  if (!isPresenceFresh(lastActiveAt)) return null;
  return {
    userId: data.user_id || docSnap.id.split("_")[0] || docSnap.id,
    channelId: data.channel_id || "",
    displayName: data.display_name || "",
    lastActiveAt,
  };
}

/**
 * Write or refresh presence for one or more channels (Talk: one, Monitor: many).
 * Removes presence docs for channels no longer in the list.
 */
export async function publishPresence({ channelIds = [], displayName = "" } = {}) {
  const uid = auth.currentUser?.uid;
  const uniqueChannelIds = [...new Set((channelIds || []).filter(Boolean))];
  if (!uid || !(await ensureAuthReady())) return;

  if (uniqueChannelIds.length === 0) {
    await clearPresence();
    return;
  }

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
      },
      { merge: true }
    );
  }

  for (const docSnap of existingSnap.docs) {
    const channelId = docSnap.data()?.channel_id;
    if (channelId && !targetSet.has(channelId)) {
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
  if (snap.empty) return;

  const batch = writeBatch(db);
  for (const docSnap of snap.docs) {
    batch.delete(docSnap.ref);
  }
  await batch.commit();
}

/**
 * Realtime listener for users currently present on a channel.
 * Stale rows are filtered client-side so we only query by channel_id (no composite index required).
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
