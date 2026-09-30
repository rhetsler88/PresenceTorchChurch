const { FieldValue } = require("firebase-admin/firestore");

const BATCH_LIMIT = 400;

function normalizeOrganization(value) {
  return (value || "").trim().toLowerCase();
}

function organizationNamesMatch(left, right) {
  const scoped = normalizeOrganization(left);
  if (!scoped) return true;
  const target = normalizeOrganization(right);
  if (!target) return true;
  return scoped === target;
}

async function commitBatchedUpdates(db, updates) {
  let committed = 0;
  for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
    const slice = updates.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const { ref, data } of slice) {
      batch.update(ref, data);
    }
    await batch.commit();
    committed += slice.length;
  }
  return committed;
}

/**
 * Rename an organization and propagate the display name to users, channels, and access requests.
 * Daily codes are keyed by org id — no change required there.
 */
async function renameOrganization(db, orgId, newNameRaw) {
  const newName = (newNameRaw || "").trim();
  if (!newName) {
    const err = new Error("Organization name is required");
    err.code = "invalid-argument";
    throw err;
  }

  const orgRef = db.collection("organizations").doc(orgId);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) {
    const err = new Error("Organization not found");
    err.code = "not-found";
    throw err;
  }

  const oldName = orgSnap.data()?.name || "";
  if (normalizeOrganization(oldName) === normalizeOrganization(newName) && oldName === newName) {
    return {
      orgId,
      name: oldName,
      changed: false,
      usersUpdated: 0,
      channelsUpdated: 0,
      accessRequestsUpdated: 0,
    };
  }

  const orgListSnap = await db.collection("organizations").get();
  const nameTaken = orgListSnap.docs.some(
    (docSnap) =>
      docSnap.id !== orgId && normalizeOrganization(docSnap.data()?.name) === normalizeOrganization(newName)
  );
  if (nameTaken) {
    const err = new Error("Another organization already uses this name");
    err.code = "already-exists";
    throw err;
  }

  const [usersSnap, channelsSnap, requestsSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("channels").get(),
    db.collection("accessRequests").get(),
  ]);

  const updates = [];

  for (const docSnap of usersSnap.docs) {
    if (organizationNamesMatch(oldName, docSnap.data()?.organization)) {
      updates.push({ ref: docSnap.ref, data: { organization: newName } });
    }
  }
  for (const docSnap of channelsSnap.docs) {
    if (organizationNamesMatch(oldName, docSnap.data()?.organization)) {
      updates.push({ ref: docSnap.ref, data: { organization: newName } });
    }
  }
  for (const docSnap of requestsSnap.docs) {
    if (organizationNamesMatch(oldName, docSnap.data()?.organization)) {
      updates.push({ ref: docSnap.ref, data: { organization: newName } });
    }
  }

  const usersUpdated = usersSnap.docs.filter((d) =>
    organizationNamesMatch(oldName, d.data()?.organization)
  ).length;
  const channelsUpdated = channelsSnap.docs.filter((d) =>
    organizationNamesMatch(oldName, d.data()?.organization)
  ).length;
  const accessRequestsUpdated = requestsSnap.docs.filter((d) =>
    organizationNamesMatch(oldName, d.data()?.organization)
  ).length;

  await commitBatchedUpdates(db, updates);
  await orgRef.update({ name: newName, updatedAt: FieldValue.serverTimestamp() });

  return {
    orgId,
    name: newName,
    previousName: oldName,
    changed: true,
    usersUpdated,
    channelsUpdated,
    accessRequestsUpdated,
  };
}

module.exports = {
  renameOrganization,
  normalizeOrganization,
  organizationNamesMatch,
};
