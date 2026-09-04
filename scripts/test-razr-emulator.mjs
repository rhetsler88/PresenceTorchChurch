#!/usr/bin/env node
/**
 * Simulates Motorola Razr cover/unfold on a running Android emulator via wm size.
 * Requires debug APK installed: church.presencetorch.app
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SDK = process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, "Android", "Sdk", "platform-tools", "adb.exe")
  : "adb";
const PKG = "church.presencetorch.app";
const ACTIVITY = "church.presencetorch.app/.MainActivity";
const OUT = join(process.cwd(), "_tmp", "razr-emulator-test");

function adb(...args) {
  const cmd = `"${SDK}" ${args.join(" ")}`;
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function shot(name) {
  adb("exec-out", "screencap", "-p").pipe
    ? null
    : null;
  const png = execSync(`"${SDK}" exec-out screencap -p`, { stdio: ["ignore", "pipe", "ignore"] });
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, png);
  console.log(`screenshot: ${file}`);
  return file;
}

function navVisible() {
  const xml = execSync(`"${SDK}" shell uiautomator dump /dev/tty`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const hasTalk = /text="Talk"|content-desc="Talk"/i.test(xml);
  const hasChannels = /text="Channels"|content-desc="Channels"/i.test(xml);
  return { hasTalk, hasChannels, raw: xml.slice(0, 500) };
}

mkdirSync(OUT, { recursive: true });

console.log("=== Razr emulator viewport test ===");
console.log("device:", adb("shell", "getprop", "ro.product.model"));

try {
  console.log("\n1. Cover display (~264x720)...");
  adb("shell", "wm", "size", "264x720");
  adb("shell", "am", "force-stop", PKG);
  adb("shell", "am", "start", "-n", ACTIVITY);
  execSync("ping -n 4 127.0.0.1 > nul", { stdio: "ignore" });
  shot("01-cover");
  const coverNav = navVisible();
  console.log("cover nav:", coverNav);

  console.log("\n2. Unfolded inner display...");
  adb("shell", "wm", "size", "1080x2400");
  execSync("ping -n 4 127.0.0.1 > nul", { stdio: "ignore" });
  shot("02-unfolded");
  const unfoldNav = navVisible();
  console.log("unfold nav:", unfoldNav);

  console.log("\n3. Back to cover...");
  adb("shell", "wm", "size", "264x720");
  execSync("ping -n 3 127.0.0.1 > nul", { stdio: "ignore" });
  shot("03-cover-again");
  const coverAgain = navVisible();
  console.log("cover again nav:", coverAgain);
} finally {
  adb("shell", "wm", "size", "reset");
  console.log("\nRestored emulator display size.");
}

const pass =
  coverNav.hasTalk &&
  coverNav.hasChannels &&
  unfoldNav.hasTalk &&
  unfoldNav.hasChannels &&
  coverAgain.hasTalk;

console.log("\n=== Result:", pass ? "PASS" : "FAIL", "===");
process.exit(pass ? 0 : 1);
