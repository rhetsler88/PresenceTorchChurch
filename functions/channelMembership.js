const { FieldValue } = require("firebase-admin/firestore");

function normalizeMemberEntry(entry) {
  return typeof entry === "string" ? entry.trim().toLowerCase() : entry;
}

/** Resolve a channel.members entry (uid or email) to a Firebase Auth uid. */
async function resolveMemberUid(db, entry) {
  if (!entry || typeof entry !== "string") return null;
  const trimmed = entry.trim();
  if (!trimmed.includes("@")) return trimmed;

  const email = trimmed.toLowerCase();
  const snap = await db
    .collection("users")
    .where("email", "==", email)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}

function memberListIncludes(members, uid, email) {
  const list = members || [];
  if (uid && list.includes(uid)) return true;
  const normalizedEmail = email ? email.trim().toLowerCase() : "";
  if (!normalizedEmail) return false;
  return list.some(
    (entry) => typeof entry === "string" && entry.trim().toLowerCase() === normalizedEmail
  );
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

/** Admin repair: sync profile memberships, normalize channel members to uid, refresh daily code. */
async function repairUserAccess(db, auth, email, { getCodeDateKey, writeSystemDailyCodeDateKey }) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes("@")) {
    const err = new Error("A valid email is required");
    err.code = "invalid-argument";
    throw err;
  }

  const authUser = await auth.getUserByEmail(normalizedEmail);
  const uid = authUser.uid;
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    const err = new Error("User profile not found");
    err.code = "not-found";
    throw err;
  }

  const dateKey = getCodeDateKey();
  await writeSystemDailyCodeDateKey(db, dateKey);
  await userRef.set(
    {
      email: normalizedEmail,
      daily_code_verified_date: dateKey,
      daily_code_failed_attempts: 0,
      daily_code_locked_until: FieldValue.delete(),
    },
    { merge: true }
  );

  const channelsSnap = await db.collection("channels").get();
  const channelIds = [];

  for (const channelDoc of channelsSnap.docs) {
    const data = channelDoc.data() || {};
    const members = data.members || [];
    const pending = data.pending_members || [];
    const listed =
      memberListIncludes(members, uid, normalizedEmail)
      || memberListIncludes(pending, uid, normalizedEmail);

    if (!listed) continue;

    channelIds.push(channelDoc.id);

    const normalizedMembers = members
      .filter((entry) => normalizeMemberEntry(entry) !== normalizedEmail && entry !== uid)
      .concat(uid);
    const normalizedPending = pending.filter(
      (entry) => normalizeMemberEntry(entry) !== normalizedEmail && entry !== uid
    );

    if (
      JSON.stringify(normalizedMembers) !== JSON.stringify(members)
      || JSON.stringify(normalizedPending) !== JSON.stringify(pending)
    ) {
      await channelDoc.ref.update({
        members: normalizedMembers,
        pending_members: normalizedPending,
      });
    }
  }

  await userRef.set({ member_of_channels: channelIds }, { merge: true });

  return {
    uid,
    email: normalizedEmail,
    channelIds,
    daily_code_verified_date: dateKey,
  };
}

module.exports = {
  resolveMemberUid,
  memberListIncludes,
  syncMemberProfilesForChannel,
  backfillAllChannelMemberships,
  repairUserAccess,
};
