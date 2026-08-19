import { readFileSync, existsSync } from "fs";
import { loadEnv } from "vite";

const env = loadEnv("production", process.cwd(), "VITE_");
const key = env.VITE_RECAPTCHA_SITE_KEY || "";
console.log(JSON.stringify({
  productionLocalExists: existsSync(".env.production.local"),
  recaptchaConfigured: key.length > 20,
  keyLength: key.length,
  keyPrefix: key.slice(0, 3),
}));
