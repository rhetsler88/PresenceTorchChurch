import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isStorePreview } from "./storePreview.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("storePreview", () => {
  it("is false when window is undefined (node test)", () => {
    assert.equal(typeof window, "undefined");
    assert.equal(isStorePreview(), false);
  });

  it("keeps App Store captures free of the PWA install prompt", () => {
    const login = readFileSync(join(root, "src/pages/Login.jsx"), "utf8");
    assert.ok(login.includes("isStorePreview"));
    assert.ok(login.includes("{!isStorePreview() && <PwaInstallPrompt />}"));
  });
});
