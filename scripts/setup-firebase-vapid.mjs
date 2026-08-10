import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const secretsPath = path.join(root, ".secrets", "vapid-keys.json");
const projectId = "presence-torch-church";

function ensureKeys() {
  if (existsSync(secretsPath)) {
    return JSON.parse(readFileSync(secretsPath, "utf8"));
  }

  mkdirSync(path.dirname(secretsPath), { recursive: true });
  const output = execSync("npx --yes web-push generate-vapid-keys --json", {
    cwd: root,
    encoding: "utf8",
  });
  const keys = JSON.parse(output);
  writeFileSync(secretsPath, JSON.stringify(keys, null, 2));
  return keys;
}

const keys = ensureKeys();

console.log("Firebase web push setup");
console.log("=======================");
console.log("");
console.log("Public key (also set in Vercel as VITE_FIREBASE_VAPID_KEY):");
console.log(keys.publicKey);
console.log("");
console.log("Private key is stored locally at:");
console.log(secretsPath);
console.log("");
console.log("Import the key pair in Firebase Console:");
console.log(
  `https://console.firebase.google.com/project/${projectId}/settings/cloudmessaging/web`
);
console.log("");
console.log("Steps:");
console.log("1. Open the URL above.");
console.log("2. Under Web Push certificates, choose Import key pair.");
console.log("3. Paste the public and private keys from .secrets/vapid-keys.json.");
console.log("4. Redeploy the Vercel app if VITE_FIREBASE_VAPID_KEY was added after the last deploy.");
