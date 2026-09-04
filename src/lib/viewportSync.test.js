import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCoverLockTransition,
  shouldUnfoldOnResume,
} from "./viewportSyncLogic.js";

/** Typical Razr inner display width in CSS px (physical screen max dimension). */
const RAZR_SCREEN_WIDTH = 1080;

describe("Razr cover display lock", () => {
  it("locks on narrow cover viewport (~264px wide)", () => {
    const result = applyCoverLockTransition(
      { lockedCoverWidth: 0, lockedCoverHeight: 0, hasUnfolded: false },
      { width: 264, height: 720, layoutWidth: 412, screenWidth: RAZR_SCREEN_WIDTH }
    );
    assert.equal(result.isCoverDisplay, true);
    assert.equal(result.lockedCoverWidth, 264);
    assert.equal(result.lockedCoverHeight, 720);
  });

  it("locks via layout/viewport mismatch even when screenWidth matches width", () => {
    const result = applyCoverLockTransition(
      { lockedCoverWidth: 0, lockedCoverHeight: 0, hasUnfolded: false },
      { width: 264, height: 720, layoutWidth: 412, screenWidth: 720 }
    );
    assert.equal(result.isCoverDisplay, true);
  });

  it("stays locked on tall cover screens (height >= 700)", () => {
    const locked = applyCoverLockTransition(
      { lockedCoverWidth: 0, lockedCoverHeight: 0, hasUnfolded: false },
      { width: 264, height: 720, layoutWidth: 412, screenWidth: RAZR_SCREEN_WIDTH }
    );
    const steady = applyCoverLockTransition(
      { ...locked, hasUnfolded: locked.hasUnfolded },
      { width: 264, height: 720, layoutWidth: 264, screenWidth: RAZR_SCREEN_WIDTH }
    );
    assert.equal(steady.isCoverDisplay, true);
    assert.equal(steady.lockedCoverHeight, 720);
  });

  it("locks tall cover screens (height 860 — no height ceiling)", () => {
    const result = applyCoverLockTransition(
      { lockedCoverWidth: 0, lockedCoverHeight: 0, hasUnfolded: false },
      { width: 264, height: 860, layoutWidth: 412, screenWidth: RAZR_SCREEN_WIDTH }
    );
    assert.equal(result.isCoverDisplay, true);
  });

  it("resume probe does not unlock on cover screen", () => {
    const lock = { lockedCoverWidth: 264, lockedCoverHeight: 720 };
    assert.equal(shouldUnfoldOnResume(lock, 720), false);
    assert.equal(shouldUnfoldOnResume(lock, 750), false);
  });
});

describe("Razr unfold detection", () => {
  it("unlocks when height jumps after unfold (stale narrow meta width)", () => {
    const cover = applyCoverLockTransition(
      { lockedCoverWidth: 0, lockedCoverHeight: 0, hasUnfolded: false },
      { width: 264, height: 720, layoutWidth: 412, screenWidth: RAZR_SCREEN_WIDTH }
    );
    assert.equal(cover.isCoverDisplay, true);

    const unfolded = applyCoverLockTransition(
      { ...cover, hasUnfolded: cover.hasUnfolded },
      { width: 264, height: 920, layoutWidth: 264, screenWidth: RAZR_SCREEN_WIDTH }
    );
    assert.equal(unfolded.isCoverDisplay, false);
    assert.equal(unfolded.hasUnfolded, true);
  });

  it("does not re-lock immediately after unfold with stale width", () => {
    const afterUnfold = {
      lockedCoverWidth: 0,
      lockedCoverHeight: 0,
      hasUnfolded: true,
    };
    const steady = applyCoverLockTransition(afterUnfold, {
      width: 264,
      height: 920,
      layoutWidth: 264,
      screenWidth: 920,
    });
    assert.equal(steady.isCoverDisplay, false);
    assert.equal(steady.hasUnfolded, true);
  });

  it("re-locks when folded back to cover strip", () => {
    const foldedBack = applyCoverLockTransition(
      { lockedCoverWidth: 0, lockedCoverHeight: 0, hasUnfolded: true },
      { width: 264, height: 720, layoutWidth: 412, screenWidth: RAZR_SCREEN_WIDTH }
    );
    assert.equal(foldedBack.isCoverDisplay, true);
    assert.equal(foldedBack.hasUnfolded, false);
  });

  it("resume probe unlocks after unfold height jump", () => {
    const lock = { lockedCoverWidth: 264, lockedCoverHeight: 720 };
    assert.equal(shouldUnfoldOnResume(lock, 920), true);
  });

  it("unlocks when full inner width is reported", () => {
    const result = applyCoverLockTransition(
      { lockedCoverWidth: 264, lockedCoverHeight: 650, hasUnfolded: false },
      { width: 412, height: 920, layoutWidth: 412, screenWidth: RAZR_SCREEN_WIDTH }
    );
    assert.equal(result.isCoverDisplay, false);
    assert.equal(result.hasUnfolded, true);
  });
});
