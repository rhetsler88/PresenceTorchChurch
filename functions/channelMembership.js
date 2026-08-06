const { FieldValue } = require("firebase-admin/firestore");

/** Resolve a channel.members entry (uid or email) to a Firebase Auth uid. */
async function resolveMemberUid(db, entry) {
  if (!entry || typeof entry !== "string") return null;
  if (!entry.includes("@")) return entry;

  const snap = await db
    .collection("users")
    .where("email", "==", entry)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}

async function addChannelToUserProfile(db, uid, channelId) {
  if (!uid || !channelId) return false;
  await db.collection("users").doc(uid).set(
    { member_of_channels: FieldValue.arrayUnion(channelId) },
    { merge: true }
  );
  return true;
}

async function removeChannelFromUserProfile(db, uid, channelId) {
  if (!uid || !channelId) return false;
  await db.collection("users").doc(uid).set(
    { member_of_channels: FieldValue.arrayRemove(channelId) },
    { merge: true }
  );
  return true;
}

/** Sync users/{uid}.member_of_channels when channel.members changes. */
async function syncMemberProfilesForChannel(db, channelId, beforeMembers, afterMembers) {
  const before = new Set(beforeMembers || []);
  const after = new Set(afterMembers || []);

  const added = [...after].filter((entry) => !before.has(entry));
  const removed = [...before].filter((entry) => !after.has(entry));

  let updated = 0;

  for (const entry of added) {
    const uid = await resolveMemberUid(db, entry);
    if (uid && (await addChannelToUserProfile(db, uid, channelId))) {
      updated += 1;
    }
  }

  for (const entry of removed) {
    const uid = await resolveMemberUid(db, entry);
    if (uid && (await removeChannelFromUserProfile(db, uid, channelId))) {
      updated += 1;
    }
  }

  return updated;
}

/** Backfill member_of_channels for every approved member on every channel. */
async function backfillAllChannelMemberships(db) {
  const channelsSnap = await db.collection("channels").get();
  let profilesUpdated = 0;
  let membersProcessed = 0;

  for (const channelDoc of channelsSnap.docs) {
    const members = channelDoc.data()?.members || [];
    for (const entry of members) {
      membersProcessed += 1;
      const uid = await resolveMemberUid(db, entry);
      if (uid && (await addChannelToUserProfile(db, uid, channelDoc.id))) {
        profilesUpdated += 1;
      }
    }
  }

  return { profilesUpdated, membersProcessed, channels: channelsSnap.size };
}

module.exports = {
  resolveMemberUid,
  syncMemberProfilesForChannel,
  backfillAllChannelMemberships,
};
