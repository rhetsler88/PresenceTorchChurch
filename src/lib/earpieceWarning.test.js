import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("earpieceWarning", () => {
  it("keys dismissal storage by user id and daily code date", () => {
    const source = readFileSync(join(root, "src/lib/earpieceWarning.js"), "utf8");
    assert.ok(source.includes("presence-earpiece-warn-"));
    assert.ok(source.includes("getCodeDateKey"));
  });

  it("mounts native-only prompt after daily gate inside AppLayout", () => {
    const layout = readFileSync(join(root, "src/components/layout/AppLayout.jsx"), "utf8");
    const prompt = readFileSync(
      join(root, "src/components/dailycode/EarpieceWarningAfterDailyGate.jsx"),
      "utf8"
    );
    const android = readFileSync(
      join(
        root,
        "android/app/src/main/java/church/presencetorch/app/NativeVoiceProcessingPlugin.java"
      ),
      "utf8"
    );
    assert.ok(layout.includes("EarpieceWarningAfterDailyGate"));
    assert.ok(prompt.includes("Capacitor.isNativePlatform()"));
    assert.ok(prompt.includes("isDailyCodeVerified"));
    assert.ok(prompt.includes("hasEarpieceConnected"));
    assert.ok(android.includes("hasEarpieceConnected"));
  });
});
