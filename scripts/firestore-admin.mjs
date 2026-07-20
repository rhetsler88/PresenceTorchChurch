import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { initializeApp, cert, getApps, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = join(__dirname, "serviceAccountKey.json");

/** @returns {import('firebase-admin/firestore').Firestore} */
export function getAdminDb() {
  if (!getApps().length) {
    try {
      const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
      initializeApp({ credential: cert(serviceAccount) });
    } catch {
      try {
        initializeApp({
          credential: applicationDefault(),
          projectId: "presence-torch-church",
        });
      } catch {
        console.error(
          "\nMissing scripts/serviceAccountKey.json and no Application Default Credentials.\n" +
            "Download a service account key from Firebase Console → Project Settings → Service Accounts,\n" +
            "or run: gcloud auth application-default login\n"
        );
        process.exit(1);
      }
    }
  }
  return getFirestore();
}
