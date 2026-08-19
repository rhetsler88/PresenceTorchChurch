import { readFileSync } from "fs";

for (const file of [".env.production.local", ".env.local", ".env.vercel.local"]) {
  try {
    const text = readFileSync(file, "utf8");
    const line = text.split(/\r?\n/).find((l) => l.startsWith("VITE_RECAPTCHA_SITE_KEY"));
    if (!line) {
      console.log(`${file}: missing`);
      continue;
    }
    const raw = line.slice("VITE_RECAPTCHA_SITE_KEY=".length).trim();
    const unquoted = raw.replace(/^"(.*)"$/, "$1");
    console.log(`${file}: len=${unquoted.length} value=${unquoted.slice(0, 6)}...`);
  } catch (err) {
    console.log(`${file}: ${err.message}`);
  }
}
