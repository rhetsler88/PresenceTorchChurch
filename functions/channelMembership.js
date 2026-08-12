const { FieldValue } = require("firebase-admin/firestore");

const ROLE_RANK = {
  user: 0,
  monitor: 1,
  lead: 2,
  director: 3,
  admin: 4,
  super_admin: 5,
};

const MODERATOR_ROLES = new Set(["super_admin", "admin"]);
const CHANNEL_LEAD_ROLES = new Set(["super_admin", "admin", "lead"]);

function roleRank(role) {
  return ROLE_RANK[role] ?? 0;
}

function normalizeMemberEntry(entry) {
  return typeof entry === "string" ? entry.trim().toLowerCase() : entry;
}

async function allProfileIdsForEmail(db, email) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return [];
  const snap = await db.collection("users").where("email", "==", normalizedEmail).get();
  return snap.docs.map((docSnap) => docSnap.id);
}

async function resolveAuthUid(db, auth, email) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return null;
  try {
    return (await auth.getUserByEmail(normalizedEmail)).uid;
  } catch {
    const ids = await allProfileIdsForEmail(db, normalizedEmail);
    return ids[0] || null;
  }
}

/** Map a channel.members entry (uid or email) to the canonical Firebase Auth uid. */
async function resolveMemberUid(db, auth, entry) {
  if (!entry || typeof entry !== "string") return null;
  const trimmed = entry.trim();
  if (trimmed.includes("@")) {
    return resolveAuthUid(db, auth, trimmed);
  }

  const profileSnap = await db.collection("users").doc(trimmed).get();
  const email = profileSnap.exists ? profileSnap.data()?.email : null;
  if (email) {
    return resolveAuthUid(db, auth, email);
  }
  return trimmed;
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

function memberListIncludesAny(members, ids = [], email) {
  const list = members || [];
  for (const id of ids) {
    if (id && list.includes(id)) return true;
  }
  return memberListIncludes(list, null, email);
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

function normalizeChannelMemberLists({ members = [], pending = [], authUid, email, orphanIds = [] }) {
  const normalizedEmail = email?.trim().toLowerCase() || "";
  const drop = new Set([authUid, ...orphanIds]);
  if (normalizedEmail) drop.add(normalizedEmail);

  const normalizedMembers = members
    .filter((entry) => {
      if (typeof entry !== "string") return false;
      if (drop.has(entry)) return false;
      if (normalizedEmail && entry.trim().toLowerCase() === normalizedEmail) return false;
      return !orphanIds.includes(entry);
    })
    .concat(authUid ? [authUid] : []);

  const normalizedPending = pending.filter((entry) => {
    if (typeof entry !== "string") return true;
    if (drop.has(entry)) return false;
    if (normalizedEmail && entry.trim().toLowerCase() === normalizedEmail) return false;
    return !orphanIds.includes(entry);
  });

  return {
    members: [...new Set(normalizedMembers)],
    pending_members: normalizedPending,
  };
}

/** Sync users/{uid}.member_of_channels when channel.members changes. */
async function syncMemberProfilesForChannel(db, auth, channelId, beforeMembers, afterMembers) {
  const before = new Set(beforeMembers || []);
  const after = new Set(afterMembers || []);

  const added = [...after].filter((entry) => !before.has(entry));
  const removed = [...before].filter((entry) => !after.has(entry));

  let updated = 0;

  for (const entry of added) {
    const uid = await resolveMemberUid(db, auth, entry);
    if (uid && (await addChannelToUserProfile(db, uid, channelId))) {
      updated += 1;
    }
  }

  for (const entry of removed) {
    const uid = await resolveMemberUid(db, auth, entry);
    if (uid && (await removeChannelFromUserProfile(db, uid, channelId))) {
      updated += 1;
    }
  }

  return updated;
}

/** Prefer elevated role from any profile sharing the user's email onto users/{authUid}. */
async function mergeElevatedProfileRole(db, authUid, email) {
  const normalizedEmail = email?.trim().toLowerCase() || "";
  if (!authUid) return "user";

  const authSnap = await db.collection("users").doc(authUid).get();
  const authData = authSnap.exists ? authSnap.data() || {} : {};
  let bestRole = authData.role || "user";
  let bestRank = roleRank(bestRole);
  let bestProfile = authData;

  if (normalizedEmail) {
    const emailSnap = await db.collection("users").where("email", "==", normalizedEmail).get();
    for (const docSnap of emailSnap.docs) {
      const data = docSnap.data() || {};
      const role = data.role || "user";
      const rank = roleRank(role);
      if (rank > bestRank) {
        bestRank = rank;
        bestRole = role;
        bestProfile = data;
      }
    }
  }

  const authDirected = authData.directed_channels || [];
  const bestDirected = bestProfile.directed_channels || [];
  const shouldMergeRole = bestRank > roleRank(authData.role || "user");
  const shouldMergeDirected =
    bestDirected.length > 0
    && bestDirected.some((channelId) => !authDirected.includes(channelId));

  if (shouldMergeRole || shouldMergeDirected) {
    const mergedDirected = shouldMergeRole
      ? (bestProfile.directed_channels || authData.directed_channels || [])
      : [...new Set([...authDirected, ...bestDirected])];

    await db.collection("users").doc(authUid).set(
      {
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
        ...(shouldMergeRole ? {
          role: bestRole,
          organization: bestProfile.organization || authData.organization || "",
          is_monitor: bestProfile.is_monitor ?? authData.is_monitor ?? false,
          onboarded: bestProfile.onboarded ?? authData.onboarded ?? false,
          receives_staff_alerts:
            bestProfile.receives_staff_alerts ?? authData.receives_staff_alerts ?? false,
          pending_staff_alerts:
            bestProfile.pending_staff_alerts ?? authData.pending_staff_alerts ?? false,
        } : {}),
        directed_channels: mergedDirected,
      },
      { merge: true }
    );
  }

  return bestRole;
}

function normalizeOrganization(value) {
  return (value || "").trim().toLowerCase();
}

function channelOrgMatchesUser(userOrg, channelOrg) {
  const scoped = normalizeOrganization(userOrg);
  if (!scoped) return true;
  const target = normalizeOrganization(channelOrg);
  if (!target) return true;
  return scoped === target;
}

function isPlatformAdminRole(role) {
  return role === "admin" || role === "super_admin";
}

function canManageChannelMembership(profile, channelId, channelData) {
  const role = profile.role || "user";
  if (isPlatformAdminRole(role)) {
    return role === "super_admin" || channelOrgMatchesUser(profile.organization, channelData.organization);
  }
  if (role !== "lead" && role !== "director") return false;

  const directed = profile.directed_channels || [];
  if (directed.length > 0) return directed.includes(channelId);
  return channelOrgMatchesUser(profile.organization, channelData.organization);
}

async function getEffectiveUserProfile(db, authUid, email) {
  await mergeElevatedProfileRole(db, authUid, email);
  const snap = await db.collection("users").doc(authUid).get();
  return snap.exists ? (snap.data() || {}) : {};
}

async function approveChannelMember(db, auth, authUid, email, channelId, memberId) {
  if (!channelId || !memberId) {
    const err = new Error("channelId and memberId are required");
    err.code = "invalid-argument";
    throw err;
  }

  const profile = await getEffectiveUserProfile(db, authUid, email);
  const channelRef = db.collection("channels").doc(channelId);
  const channelSnap = await channelRef.get();
  if (!channelSnap.exists) {
    const err = new Error("Channel not found");
    err.code = "not-found";
    throw err;
  }

  const channelData = channelSnap.data() || {};
  if (!canManageChannelMembership(profile, channelId, channelData)) {
    const err = new Error("Not allowed to manage membership for this channel");
    err.code = "permission-denied";
    throw err;
  }

  const memberUid = await resolveMemberUid(db, auth, memberId);
  const members = (channelData.members || []).filter(
    (entry) => entry !== memberId && entry !== memberUid
  );
  const pending = (channelData.pending_members || []).filter(
    (entry) => entry !== memberId && entry !== memberUid
  );
  const memberEntry = memberUid || memberId;

  await channelRef.update({
    members: memberEntry ? [...members, memberEntry] : members,
    pending_members: pending,
  });

  return { channelId, memberId: memberEntry };
}

async function rejectChannelMember(db, auth, authUid, email, channelId, memberId) {
  if (!channelId || !memberId) {
    const err = new Error("channelId and memberId are required");
    err.code = "invalid-argument";
    throw err;
  }

  const profile = await getEffectiveUserProfile(db, authUid, email);
  const channelRef = db.collection("channels").doc(channelId);
  const channelSnap = await channelRef.get();
  if (!channelSnap.exists) {
    const err = new Error("Channel not found");
    err.code = "not-found";
    throw err;
  }

  const channelData = channelSnap.data() || {};
  if (!canManageChannelMembership(profile, channelId, channelData)) {
    const err = new Error("Not allowed to manage membership for this channel");
    err.code = "permission-denied";
    throw err;
  }

  const memberUid = await resolveMemberUid(db, auth, memberId);
  const pending = (channelData.pending_members || []).filter(
    (entry) => entry !== memberId && entry !== memberUid
  );

  await channelRef.update({ pending_members: pending });

  return { channelId, memberId };
}

async function assertModeratorRole(db, authUid, email) {
  const role = await mergeElevatedProfileRole(db, authUid, email);
  if (!MODERATOR_ROLES.has(role)) {
    const err = new Error("Admin role required");
    err.code = "permission-denied";
    throw err;
  }
  return role;
}

async function syncChannelAccessForAuthUser(db, auth, uid, email) {
  const normalizedEmail = email?.trim().toLowerCase() || "";
  const authUid = uid || (normalizedEmail ? await resolveAuthUid(db, auth, normalizedEmail) : null);
  if (!authUid) {
    const err = new Error("Authenticated user not found");
    err.code = "not-found";
    throw err;
  }

  await mergeElevatedProfileRole(db, authUid, normalizedEmail);

  const profileIds = await allProfileIdsForEmail(db, normalizedEmail);
  const allIds = [...new Set([authUid, ...profileIds])];
  const orphanIds = allIds.filter((id) => id !== authUid);

  const authProfileSnap = await db.collection("users").doc(authUid).get();
  const effectiveRole = authProfileSnap.data()?.role || "user";

  const channelsSnap = await db.collection("channels").get();
  const channelIds = [];
  let channelsNormalized = 0;

  for (const channelDoc of channelsSnap.docs) {
    const data = channelDoc.data() || {};
    const members = data.members || [];
    const pending = data.pending_members || [];
    const listed =
      memberListIncludesAny(members, allIds, normalizedEmail)
      || memberListIncludesAny(pending, allIds, normalizedEmail);

    if (!listed) continue;

    channelIds.push(channelDoc.id);

    const normalized = normalizeChannelMemberLists({
      members,
      pending,
      authUid,
      email: normalizedEmail,
      orphanIds,
    });

    if (
      JSON.stringify(normalized.members) !== JSON.stringify(members)
      || JSON.stringify(normalized.pending_members) !== JSON.stringify(pending)
    ) {
      await channelDoc.ref.update(normalized);
      channelsNormalized += 1;
    }
  }

  await db.collection("users").doc(authUid).set(
    {
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      member_of_channels: channelIds,
    },
    { merge: true }
  );

  return {
    uid: authUid,
    email: normalizedEmail,
    channelIds,
    role: effectiveRole,
    orphanProfileIds: orphanIds,
    channelsNormalized,
  };
}

/** Backfill member_of_channels for every approved member on every channel. */
async function backfillAllChannelMemberships(db, auth) {
  const channelsSnap = await db.collection("channels").get();
  let profilesUpdated = 0;
  let membersProcessed = 0;

  for (const channelDoc of channelsSnap.docs) {
    const members = channelDoc.data()?.members || [];
    for (const entry of members) {
      membersProcessed += 1;
      const uid = await resolveMemberUid(db, auth, entry);
      if (uid && (await addChannelToUserProfile(db, uid, channelDoc.id))) {
        profilesUpdated += 1;
      }
    }
  }

  return { profilesUpdated, membersProcessed, channels: channelsSnap.size };
}

/** Admin repair: sync profile memberships, normalize orphan uids, refresh daily code. */
async function repairUserAccess(
  db,
  auth,
  email,
  { getCodeDateKey, writeSystemDailyCodeDateKey, dailyCodeValidityPatch }
) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes("@")) {
    const err = new Error("A valid email is required");
    err.code = "invalid-argument";
    throw err;
  }

  const authUid = await resolveAuthUid(db, auth, normalizedEmail);
  if (!authUid) {
    const err = new Error("No Firebase Auth account for that email");
    err.code = "not-found";
    throw err;
  }

  const userRef = db.collection("users").doc(authUid);
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
      ...dailyCodeValidityPatch(dateKey),
    },
    { merge: true }
  );

  const access = await syncChannelAccessForAuthUser(db, auth, authUid, normalizedEmail);

  return {
    ...access,
    daily_code_verified_date: dateKey,
  };
}

async function diagnoseUserAccess(db, auth, email, { getCodeDateKey }) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail?.includes("@")) {
    const err = new Error("A valid email is required");
    err.code = "invalid-argument";
    throw err;
  }

  let authUid = null;
  let authEmail = null;
  try {
    const authUser = await auth.getUserByEmail(normalizedEmail);
    authUid = authUser.uid;
    authEmail = authUser.email || null;
  } catch {
    authUid = null;
  }

  const profileSnaps = await db.collection("users").where("email", "==", normalizedEmail).get();
  const profiles = profileSnaps.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      matchesAuthUid: docSnap.id === authUid,
      role: data.role || "user",
      organization: data.organization || "",
      member_of_channels: data.member_of_channels || [],
      daily_code_verified_date: data.daily_code_verified_date || "",
      daily_code_valid_until: data.daily_code_valid_until?.toDate?.()?.toISOString?.() || null,
    };
  });

  const systemSnap = await db.collection("system").doc("dailyCode").get();
  const allIds = [...new Set([authUid, ...profiles.map((p) => p.id)].filter(Boolean))];

  const channels = [];
  const channelsSnap = await db.collection("channels").get();
  for (const channelDoc of channelsSnap.docs) {
    const data = channelDoc.data() || {};
    const members = data.members || [];
    const matchedBy = members.filter(
      (entry) => allIds.includes(entry) || normalizeMemberEntry(entry) === normalizedEmail
    );
    if (!matchedBy.length) continue;
    channels.push({
      id: channelDoc.id,
      name: data.name || "",
      members,
      matchedBy,
      usesAuthUid: authUid ? members.includes(authUid) : false,
    });
  }

  const authProfile = profiles.find((p) => p.id === authUid) || null;

  return {
    email: normalizedEmail,
    authUid,
    authEmail,
    todayDateKey: getCodeDateKey(),
    systemDailyCode: systemSnap.exists ? systemSnap.data() : null,
    profiles,
    channels,
    issues: [
      !authUid && "No Firebase Auth user for this email",
      profiles.length > 1 && "Multiple Firestore profiles share this email",
      authProfile && !authProfile.member_of_channels?.length && channels.length > 0
        && "Auth profile is missing member_of_channels despite channel membership",
      authProfile
        && authProfile.daily_code_verified_date
        && systemSnap.exists
        && authProfile.daily_code_verified_date !== systemSnap.data()?.dateKey
        && "Daily code date on profile does not match system/dailyCode.dateKey",
      channels.some((ch) => !ch.usesAuthUid)
        && "One or more channels list an orphan uid/email instead of the auth uid",
    ].filter(Boolean),
  };
}

module.exports = {
  resolveMemberUid,
  memberListIncludes,
  memberListIncludesAny,
  syncMemberProfilesForChannel,
  syncChannelAccessForAuthUser,
  backfillAllChannelMemberships,
  repairUserAccess,
  diagnoseUserAccess,
  mergeElevatedProfileRole,
  assertModeratorRole,
  approveChannelMember,
  rejectChannelMember,
};
