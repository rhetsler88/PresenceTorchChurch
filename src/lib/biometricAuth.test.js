import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("biometricAuth", () => {
  it("handles iOS Face ID cancel code 16 like Android cancel codes", () => {
    const source = readFileSync(join(root, "src/lib/biometricAuth.js"), "utf8");
    assert.ok(source.includes("export function isBiometricCancelled"));
    assert.ok(source.includes('code === "16"'));
    assert.ok(source.includes("code === 10"));
    assert.ok(source.includes("code === 13"));

    const panel = readFileSync(join(root, "src/components/auth/AuthSignInPanel.jsx"), "utf8");
    assert.ok(panel.includes("isBiometricCancelled"));
    assert.ok(panel.includes("isStorePreview"));
    assert.ok(!panel.includes("err?.code === 10"));
  });

  it("uses the device biometric label in the Face ID prompt", () => {
    const source = readFileSync(join(root, "src/lib/biometricAuth.js"), "utf8");
    assert.ok(source.includes("const label = await getBiometricLabel()"));
    assert.ok(source.includes("Confirm with ${label}"));
  });
});
