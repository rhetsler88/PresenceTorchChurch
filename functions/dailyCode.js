const crypto = require("crypto");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");

const ETZ = "America/New_York";
const ROLLOVER_HOUR_ET = 0;
const ROLLOVER_MINUTE_ET = 1;

const MAX_VERIFY_ATTEMPTS = 10;
const VERIFY_LOCKOUT_MS = 15 * 60 * 1000;

function normalizeOrganization(value) {
  return (value || "").trim().toLowerCase();
}

/**
 * Returns yyyy-MM-dd for the daily code period (rollover at 12:01 AM ET).
 * Matches src/lib/dailyCode.js.
 */
function getCodeDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ETZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  const y = get("year");
  const m = get("month");
  const d = get("day");
  const h = parseInt(get("hour"), 10) % 24;
  const min = parseInt(get("minute"), 10);

  if (h === ROLLOVER_HOUR_ET && min < ROLLOVER_MINUTE_ET) {
    const prev = new Date(date);
    prev.setDate(prev.getDate() - 1);
    const prevParts = new Intl.DateTimeFormat("en-US", {
      timeZone: ETZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(prev);
    const pGet = (type) => prevParts.find((p) => p.type === type).value;
    return `${pGet("year")}-${pGet("month")}-${pGet("day")}`;
  }
  return `${y}-${m}-${d}`;
}

function addDaysToDateKey(dateKey, days = 1) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** UTC instant when the current daily-code period ends (next 12:01 AM ET). */
function getDailyCodeValidUntil(from = new Date()) {
  const endDateKey = addDaysToDateKey(getCodeDateKey(from), 1);
  const [year, month, day] = endDateKey.split("-").map(Number);
  const startUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const endUtc = Date.UTC(year, month - 1, day + 1, 12, 0, 0);

  for (let utcMs = startUtc; utcMs <= endUtc; utcMs += 60_000) {
    const candidate = new Date(utcMs);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: ETZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(candidate);
    const get = (type) => parts.find((p) => p.type === type).value;
    const key = `${get("year")}-${get("month")}-${get("day")}`;
    const hour = parseInt(get("hour"), 10) % 24;
    const minute = parseInt(get("minute"), 10);
    if (key === endDateKey && hour === ROLLOVER_HOUR_ET && minute === ROLLOVER_MINUTE_ET) {
      return candidate;
    }
  }

  return new Date(startUtc + 24 * 60 * 60 * 1000);
}

function dailyCodeValidityPatch(dateKey, from = new Date()) {
  return {
    daily_code_verified_date: dateKey,
    daily_code_valid_until: Timestamp.fromDate(getDailyCodeValidUntil(from)),
    daily_code_failed_attempts: 0,
    daily_code_locked_until: FieldValue.delete(),
  };
}

function generateDailyCode() {
  return crypto.randomInt(0, 10_000_000).toString().padStart(7, "0");
}

async function listOrganizations(db) {
  const snap = await db.collection("organizations").get();
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

async function resolveOrgIdForOrganizationName(db, organizationName) {
  const target = normalizeOrganization(organizationName);
  if (!target) return null;

  const orgs = await listOrganizations(db);
  const match = orgs.find((org) => normalizeOrganization(org.name) === target);
  return match?.id || null;
}

async function writeSystemDailyCodeDateKey(db, dateKey) {
  await db.collection("system").doc("dailyCode").set(
    {
      dateKey,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function ensureDailyCodeForOrg(db, orgId, dateKey = getCodeDateKey()) {
  const ref = db.collection("dailyCodes").doc(orgId);
  const snap = await ref.get();
  if (snap.exists && snap.data()?.dateKey === dateKey && snap.data()?.code) {
    return snap.data();
  }

  const code = generateDailyCode();
  const payload = {
    code,
    dateKey,
    organizationId: orgId,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(payload, { merge: true });
  return payload;
}

async function rotateAllDailyCodes(db) {
  const dateKey = getCodeDateKey();
  const orgs = await listOrganizations(db);

  if (!orgs.length) {
    await writeSystemDailyCodeDateKey(db, dateKey);
    return { dateKey, organizations: 0 };
  }

  const batch = db.batch();
  for (const org of orgs) {
    const ref = db.collection("dailyCodes").doc(org.id);
    batch.set(
      ref,
      {
        code: generateDailyCode(),
        dateKey,
        organizationId: org.id,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  await batch.commit();
  await writeSystemDailyCodeDateKey(db, dateKey);

  return { dateKey, organizations: orgs.length };
}

function bypassesDailyCode(role) {
  return role === "super_admin" || role === "admin" || role === "director";
}

function assertCanViewDailyCode(userData, orgName) {
  const role = userData?.role || "user";
  if (role === "super_admin") return;
  if (role !== "admin" && role !== "director") {
    const err = new Error("Admin or director role required");
    err.code = "permission-denied";
    throw err;
  }
  const userOrg = normalizeOrganization(userData.organization);
  const targetOrg = normalizeOrganization(orgName);
  if (userOrg && targetOrg && userOrg !== targetOrg) {
    const err = new Error("Not allowed to view this organization's code");
    err.code = "permission-denied";
    throw err;
  }
}

async function verifyDailyAccessCode(db, uid, submittedCode) {
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    const err = new Error("User profile not found");
    err.code = "not-found";
    throw err;
  }

  const userData = userSnap.data();
  const role = userData.role || "user";
  const dateKey = getCodeDateKey();

  if (bypassesDailyCode(role)) {
    await userRef.set(dailyCodeValidityPatch(dateKey), { merge: true });
    return { verified: true, dateKey, bypassed: true };
  }

  const lockedUntil = userData.daily_code_locked_until?.toMillis?.() || 0;
  if (lockedUntil > Date.now()) {
    const err = new Error("Too many failed attempts. Try again later.");
    err.code = "resource-exhausted";
    throw err;
  }

  if (typeof submittedCode !== "string" || !/^\d{7}$/.test(submittedCode)) {
    const err = new Error("Enter a valid 7-digit code");
    err.code = "invalid-argument";
    throw err;
  }

  const orgId = await resolveOrgIdForOrganizationName(db, userData.organization);
  if (!orgId) {
    const err = new Error("Your account is not assigned to an organization");
    err.code = "failed-precondition";
    throw err;
  }

  const dailyCode = await ensureDailyCodeForOrg(db, orgId, dateKey);
  await writeSystemDailyCodeDateKey(db, dateKey);

  if (submittedCode !== dailyCode.code) {
    const attempts = (userData.daily_code_failed_attempts || 0) + 1;
    const patch = { daily_code_failed_attempts: attempts };
    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      patch.daily_code_locked_until = new Date(Date.now() + VERIFY_LOCKOUT_MS);
      patch.daily_code_failed_attempts = 0;
    }
    await userRef.set(patch, { merge: true });
    const err = new Error("Incorrect code");
    err.code = "permission-denied";
    throw err;
  }

  await userRef.set(dailyCodeValidityPatch(dateKey), { merge: true });

  return { verified: true, dateKey };
}

async function getDailyAccessCodeForUser(db, userData) {
  const role = userData?.role || "user";
  if (!bypassesDailyCode(role)) {
    const err = new Error("Admin or director role required");
    err.code = "permission-denied";
    throw err;
  }

  const orgId = await resolveOrgIdForOrganizationName(db, userData.organization);
  if (!orgId) {
    const err = new Error("Assign your account to an organization to view its daily code");
    err.code = "failed-precondition";
    throw err;
  }

  const orgSnap = await db.collection("organizations").doc(orgId).get();
  if (!orgSnap.exists) {
    const err = new Error("Organization not found");
    err.code = "not-found";
    throw err;
  }

  assertCanViewDailyCode(userData, orgSnap.data().name);

  const dateKey = getCodeDateKey();
  const dailyCode = await ensureDailyCodeForOrg(db, orgId, dateKey);
  await writeSystemDailyCodeDateKey(db, dateKey);

  return { code: dailyCode.code, dateKey };
}

module.exports = {
  MAX_VERIFY_ATTEMPTS,
  VERIFY_LOCKOUT_MS,
  normalizeOrganization,
  getCodeDateKey,
  getDailyCodeValidUntil,
  dailyCodeValidityPatch,
  generateDailyCode,
  resolveOrgIdForOrganizationName,
  ensureDailyCodeForOrg,
  writeSystemDailyCodeDateKey,
  rotateAllDailyCodes,
  bypassesDailyCode,
  verifyDailyAccessCode,
  getDailyAccessCodeForUser,
};
