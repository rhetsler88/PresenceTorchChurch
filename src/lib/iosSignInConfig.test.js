import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const IOS_CLIENT_ID =
  "956501692008-v842mpcnv1r10gs8nj3r4j3h1lnmngop.apps.googleusercontent.com";
const WEB_CLIENT_ID =
  "956501692008-lj14r06gtrg12034uoo362k4qhmfen99.apps.googleusercontent.com";
const REVERSED_CLIENT_ID =
  "com.googleusercontent.apps.956501692008-v842mpcnv1r10gs8nj3r4j3h1lnmngop";

describe("native iOS sign-in configuration", () => {
  it("declares Google Sign-In client IDs required by GIDSignIn 7+", () => {
    const plist = readFileSync(join(root, "ios/App/App/Info.plist"), "utf8");
    assert.match(plist, /<key>GIDClientID<\/key>\s*<string>956501692008-v842mpcnv1r10gs8nj3r4j3h1lnmngop/);
    assert.match(plist, /<key>GIDServerClientID<\/key>\s*<string>956501692008-lj14r06gtrg12034uoo362k4qhmfen99/);
    assert.ok(plist.includes(IOS_CLIENT_ID));
    assert.ok(plist.includes(WEB_CLIENT_ID));
    assert.ok(plist.includes(REVERSED_CLIENT_ID));
  });

  it("returns Google OAuth URLs to GIDSignIn from AppDelegate", () => {
    const appDelegate = readFileSync(join(root, "ios/App/App/AppDelegate.swift"), "utf8");
    assert.ok(appDelegate.includes("import GoogleSignIn"));
    assert.ok(appDelegate.includes("GIDSignIn.sharedInstance.handle(url)"));
  });

  it("keeps native Google and Apple providers enabled for skipNativeAuth", () => {
    const config = readFileSync(join(root, "capacitor.config.ts"), "utf8");
    assert.match(config, /skipNativeAuth:\s*true/);
    assert.match(config, /providers:\s*\['google\.com',\s*'apple\.com'\]/);
  });

  it("uses the web client as the Google ID token audience", () => {
    const handler = readFileSync(
      join(
        root,
        "node_modules/@capacitor-firebase/authentication/ios/Plugin/Handlers/GoogleAuthProviderHandler.swift"
      ),
      "utf8"
    );
    assert.ok(handler.includes('Bundle.main.object(forInfoDictionaryKey: "GIDServerClientID")'));
    assert.ok(handler.includes("serverClientID: serverClientId ?? clientId"));
  });
});
