/**
 * Adds Vercel deployment domains to Firebase Auth authorized domains.
 *
 * Requires scripts/serviceAccountKey.json (Firebase service account with Owner/Editor).
 * Run: npm run setup:domains
 */
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { GoogleAuth } from "google-auth-library";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = join(__dirname, "serviceAccountKey.json");
const PROJECT_ID = "presence-torch-church";

const DOMAINS_TO_ADD = [
  "presencetorchchurch.vercel.app",
  "presencetorchchurch-65128pib9-presence-torch-church.vercel.app",
  "presencetorchchurch-admin.vercel.app",
  "localhost",
];

async function main() {
  if (!existsSync(keyPath)) {
    console.error(
      "\nMissing scripts/serviceAccountKey.json\n" +
        "Download from Firebase Console → Project Settings → Service Accounts\n" +
        "Then run: npm run setup:domains\n\n" +
        "Or add these domains manually in Firebase Console → Authentication → Settings → Authorized domains:\n" +
        DOMAINS_TO_ADD.filter((d) => d !== "localhost")
          .map((d) => `  - ${d}`)
          .join("\n")
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
  const { data: config } = await client.request({ url: configUrl });

  const existing = config.authorizedDomains || [];
  const merged = [...new Set([...existing, ...DOMAINS_TO_ADD])];

  await client.request({
    url: `${configUrl}?updateMask=authorizedDomains`,
    method: "PATCH",
    data: { authorizedDomains: merged },
  });

  console.log("Firebase authorized domains updated:");
  merged.forEach((d) => console.log(`  ✓ ${d}`));
}

main().catch((err) => {
  console.error("Failed:", err.message || err);
  process.exit(1);
});
