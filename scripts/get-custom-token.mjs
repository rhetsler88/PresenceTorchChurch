/** Print a Firebase custom auth token for screenshot automation. */
import { getAuth } from "firebase-admin/auth";
import { getAdminDb } from "./firestore-admin.mjs";

const email = (process.env.PLAY_REVIEWER_EMAIL || "playstore-reviewer@presencetorch.net").trim().toLowerCase();

getAdminDb();
const auth = getAuth();
const user = await auth.getUserByEmail(email);
const token = await auth.createCustomToken(user.uid, {
  role: user.customClaims?.role || "director",
  is_monitor: user.customClaims?.is_monitor || false,
});
process.stdout.write(token);
