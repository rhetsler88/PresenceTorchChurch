/**
 * Create (or reset) a Google Play reviewer test account.
 *
 * Requires scripts/serviceAccountKey.json — same as npm run seed.
 *
 * Usage:
 *   npm run create:play-reviewer
 *
 * Optional env:
 *   PLAY_REVIEWER_EMAIL=playstore-reviewer@example.com
 *   PLAY_REVIEWER_PASSWORD=YourSecurePassword123!
 *   PLAY_REVIEWER_CHANNEL=safety-team
 *   PLAY_REVIEWER_ORG=Potter's House - Columbus
 *   PLAY_REVIEWER_ROLE=director
 */
import { randomBytes } from "crypto";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "./firestore-admin.mjs";

const DEFAULT_EMAIL = "playstore-reviewer@presencetorch.net";
const DEFAULT_CHANNEL = "safety-team";
const DEFAULT_ORG = "Potter's House - Columbus";
const DEFAULT_ROLE = "director";

function generatePassword() {
  return randomBytes(12).toString("base64url");
}

async function ensureAuthUser(auth, email, password, displayName) {
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, {
      password,
      displayName,
      emailVerified: true,
      disabled: false,
    });
    return { uid: existing.uid, created: false };
  } catch (err) {
    if (err?.code !== "auth/user-not-found") throw err;
    const created = await auth.createUser({
      email,
      password,
      displayName,
      emailVerified: true,
      disabled: false,
    });
    return { uid: created.uid, created: true };
  }
}

async function main() {
  const email = (process.env.PLAY_REVIEWER_EMAIL || DEFAULT_EMAIL).trim().toLowerCase();
  const password = process.env.PLAY_REVIEWER_PASSWORD || generatePassword();
  const channelId = process.env.PLAY_REVIEWER_CHANNEL || DEFAULT_CHANNEL;
  const organization = process.env.PLAY_REVIEWER_ORG || DEFAULT_ORG;
  const role = (process.env.PLAY_REVIEWER_ROLE || DEFAULT_ROLE).trim().toLowerCase();
  const displayName = "Play Store Reviewer";

  const db = getAdminDb();
  const auth = getAuth();

  const { uid, created } = await ensureAuthUser(auth, email, password, displayName);

  const userRef = db.collection("users").doc(uid);
  await userRef.set(
    {
      email,
      first_name: "Play",
      last_name: "Reviewer",
      full_name: displayName,
      role,
      onboarded: true,
      organization,
      member_of_channels: [channelId],
      directed_channels: [],
      broadcast_excluded_channels: [],
      is_monitor: false,
      receives_staff_alerts: false,
      pending_staff_alerts: false,
      daily_code_verified_date: "2099-12-31",
      daily_code_valid_until: Timestamp.fromDate(new Date("2099-12-31T23:59:59Z")),
      daily_code_failed_attempts: 0,
      play_reviewer_account: true,
      updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await auth.setCustomUserClaims(uid, { role, is_monitor: false });

  const channelRef = db.collection("channels").doc(channelId);
  const channelSnap = await channelRef.get();
  if (!channelSnap.exists) {
    throw new Error(`Channel "${channelId}" not found. Run npm run seed or create the channel first.`);
  }

  const data = channelSnap.data();
  const members = [...new Set([...(data.members || []), uid, email])];
  const pending = (data.pending_members || []).filter(
    (entry) => entry !== uid && entry !== email
  );

  await channelRef.set(
    {
      members,
      pending_members: pending,
    },
    { merge: true }
  );

  console.log("\nPlay Store reviewer account ready.\n");
  console.log(`  Status:   ${created ? "Created" : "Updated existing user"}`);
  console.log(`  UID:      ${uid}`);
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Role:     ${role} (no daily access code)`);
  console.log(`  Org:      ${organization}`);
  console.log(`  Channel:  ${channelId}`);
  console.log("\nPlay Console → App access — paste:\n");
  console.log(
    [
      "Sign in with email and password (not Google).",
      "",
      `Email: ${email}`,
      `Password: ${password}`,
      "",
      "Steps:",
      "1. Open the app",
      '2. On the sign-in screen, use the "Sign in" tab',
      "3. Enter the email and password above",
      '4. Complete the "I\'m not a robot" check if shown',
      "5. Use Talk → Safety Team for push-to-talk testing",
      "",
      "No daily access code is required for this account.",
    ].join("\n")
  );
  console.log("");
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
