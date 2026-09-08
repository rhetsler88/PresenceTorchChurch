import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const shotRoot = join(root, "assets", "app-store-screenshots");

/** Official App Store Connect portrait sizes we ship for this sign-in frame. */
const REQUIRED = [
  { dir: "iphone-6.9-inch-1320x2868", width: 1320, height: 2868 },
  { dir: "iphone-6.9-inch-1290x2796", width: 1290, height: 2796 },
  { dir: "iphone-6.5-inch-1284x2778", width: 1284, height: 2778 },
  { dir: "iphone-5.5-inch-1242x2208", width: 1242, height: 2208 },
  { dir: "ipad-13-inch-2064x2752", width: 2064, height: 2752 },
];

const FRAMES = ["01-signin.png", "02-talk.png"];

describe("App Store Connect screenshots", () => {
  for (const spec of REQUIRED) {
    for (const frame of FRAMES) {
      it(`${spec.dir}/${frame} is an opaque PNG at ${spec.width}x${spec.height}`, async () => {
        const file = join(shotRoot, spec.dir, frame);
        const meta = await sharp(file).metadata();
        assert.equal(meta.format, "png");
        assert.equal(meta.width, spec.width);
        assert.equal(meta.height, spec.height);
        assert.equal(meta.hasAlpha, false);
        assert.equal(meta.channels, 3);
        const bytes = statSync(file).size;
        assert.ok(bytes > 50_000, "screenshot looks empty");
        assert.ok(bytes < 8 * 1024 * 1024, "App Store Connect max is 8MB");
      });
    }
  }

  it("keeps source frames for regeneration", () => {
    const names = readdirSync(shotRoot);
    assert.ok(names.includes("source-signin.png"));
    assert.ok(names.includes("source-talk.png"));
  });
});
