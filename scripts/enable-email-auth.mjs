/**
 * Enables Email/Password sign-in for Firebase Authentication.
 *
 * Requires scripts/serviceAccountKey.json (Firebase service account with Owner/Editor).
 * Run: npm run setup:email-auth
 *
 * Or enable manually in Firebase Console → Authentication → Sign-in method → Email/Password.
 */
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { GoogleAuth } from "google-auth-library";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = join(__dirname, "serviceAccountKey.json");
const PROJECT_ID = "presence-torch-church";

async function main() {
  if (!existsSync(keyPath)) {
    console.error(
      "\nMissing scripts/serviceAccountKey.json\n" +
        "Download from Firebase Console → Project Settings → Service Accounts\n" +
        "Then run: npm run setup:email-auth\n\n" +
        "Or enable manually:\n" +
        "  Firebase Console → Authentication → Sign-in method → Email/Password → Enable\n"
    );
    process.exit(1);
  }

  const credentials = JSON.parse(readFileSync(keyPath, "utf8"));
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();

  const configUrl = `https://identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/config`;

  await client.request({
    url: `${configUrl}?updateMask=signIn.email`,
    method: "PATCH",
    data: {
      signIn: {
        email: {
          enabled: true,
          passwordRequired: true,
        },
      },
    },
  });

  console.log("Email/Password sign-in enabled for Firebase project:", PROJECT_ID);
}

main().catch((err) => {
  console.error("Failed:", err.message || err);
  process.exit(1);
});
