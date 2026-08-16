import { cpSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const source = path.join(root, "node_modules", "agora-extension-ai-denoiser", "external");
const target = path.join(root, "public", "agora-ai-denoiser");

if (!existsSync(source)) {
  console.warn("agora-extension-ai-denoiser not installed; skipping WASM copy");
  process.exit(0);
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log("Copied Agora AI denoiser WASM assets to public/agora-ai-denoiser");
