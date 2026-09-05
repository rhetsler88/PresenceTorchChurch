import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCoverScreenSize } from "./flipScreen.js";

describe("flip cover screen detection", () => {
  it("detects Razr cover width (~264px)", () => {
    assert.equal(isCoverScreenSize(264, 720), true);
  });

  it("detects narrow height cover strip", () => {
    assert.equal(isCoverScreenSize(720, 480), true);
  });

  it("treats unfolded inner display as main screen", () => {
    assert.equal(isCoverScreenSize(1080, 2400), false);
  });
});
