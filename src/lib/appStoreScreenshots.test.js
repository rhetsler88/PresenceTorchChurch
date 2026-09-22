import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { findUploadProblems, SLOTS as REQUIRED } from "./appStoreScreenshotSpec.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const shotRoot = join(root, "assets", "app-store-screenshots");

describe("App Store Connect screenshots", () => {
  for (const spec of REQUIRED) {
    for (const frame of spec.frames) {
      it(`${spec.dir}/${frame} uploads to the ${spec.label} slot`, async () => {
        const file = join(shotRoot, spec.dir, frame);
        const meta = await sharp(file).metadata();
        const bytes = statSync(file).size;

        assert.deepEqual(findUploadProblems({ ...meta, bytes }), []);
        assert.equal(meta.format, "jpeg");
        assert.equal(meta.width, spec.width);
        assert.equal(meta.height, spec.height);
        assert.equal(meta.channels, 3);
        assert.equal(meta.isProgressive, false);
        assert.ok(bytes > 50_000, "screenshot looks empty");
      });
    }
  }

  it("keeps source frames for regeneration", () => {
    const names = readdirSync(shotRoot);
    assert.ok(names.includes("source-signin.png"));
    assert.ok(names.includes("source-daily-code.png"));
    assert.ok(names.includes("source-talk.png"));
  });

  it("captures the iPad sign-in frame at an iPad viewport, not from a phone", async () => {
    const meta = await sharp(join(shotRoot, "source-ipad-signin.png")).metadata();
    assert.ok(meta.width >= 2048, `iPad master is only ${meta.width}px wide`);
    assert.ok(meta.width / meta.height > 0.7, "an iPad master should be near 3:4, not phone-shaped");
  });

  it("ships no leftovers from an earlier export or form factor", () => {
    for (const spec of REQUIRED) {
      assert.deepEqual(readdirSync(join(shotRoot, spec.dir)).sort(), [...spec.frames].sort());
    }
  });
});
