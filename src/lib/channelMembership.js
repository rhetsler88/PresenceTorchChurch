import { collection, doc, getDocs, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

async function waitForFirestoreAuth() {
  await auth.authStateReady();
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) {
    throw Object.assign(new Error("Not authenticated"), { code: "auth/not-authenticated" });
  }
  await firebaseUser.getIdToken(true);
  return firebaseUser;
}

function channelIdsForUser(channels, userId, email) {
  return channels
    .filter((channel) => {
      const members = channel.members || [];
      if (userId && members.includes(userId)) return true;
      if (email && members.includes(email)) return true;
      return false;
    })
    .map((channel) => channel.id);
}

/** Keep users/{uid}.member_of_channels in sync for query-compatible Firestore rules. */
export async function addUserChannelMembership(userId, channelId) {
  if (!userId || !channelId) return;
  await waitForFirestoreAuth();
  await updateDoc(doc(db, "users", userId), {
    member_of_channels: arrayUnion(channelId),
  });
}

export async function removeUserChannelMembership(userId, channelId) {
  if (!userId || !channelId) return;
  await updateDoc(doc(db, "users", userId), {
    member_of_channels: arrayRemove(channelId),
  });
}

/**
 * Backfill member_of_channels from channel.members (uid or email).
 * Required before Firestore collection queries/subscribes on voiceMessages, pttSignals, etc.
 */
export async function syncUserChannelMembership(userId, email) {
  if (!userId) return [];

  const snap = await getDocs(collection(db, "channels"));
  const channels = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const channelIds = channelIdsForUser(channels, userId, email);
  if (channelIds.length === 0) return [];

  await updateDoc(doc(db, "users", userId), {
    member_of_channels: channelIds,
  });
  return channelIds;
}

/** Ensure one channel is on the user doc if they appear in channel.members. */
export async function ensureUserChannelMembership(userId, email, channel) {
  if (!userId || !channel?.id) return false;

  const members = channel.members || [];
  const listed =
    members.includes(userId) || (email && members.includes(email));
  if (!listed) return false;

  await addUserChannelMembership(userId, channel.id);
  return true;
}

export function userHasFirestoreChannelAccess(user, channelId) {
  if (!user?.id || !channelId) return false;
  if (user.role === "super_admin" || user.role === "admin") return true;
  if (user.role === "director" || user.role === "monitor" || user.is_monitor) {
    return true;
  }
  return (user.member_of_channels || []).includes(channelId);
}
