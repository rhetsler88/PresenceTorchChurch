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
      { lockedCoverWidth: 0, lockedCoverHeight: 0 },
      { width: 264, height: 720, screenWidth: RAZR_SCREEN_WIDTH }
    );
    assert.equal(result.isCoverDisplay, true);
    assert.equal(result.lockedCoverWidth, 264);
    assert.equal(result.lockedCoverHeight, 720);
  });

  it("stays locked on tall cover screens (height >= 700)", () => {
    const locked = applyCoverLockTransition(
      { lockedCoverWidth: 0, lockedCoverHeight: 0 },
      { width: 264, height: 720, screenWidth: RAZR_SCREEN_WIDTH }
    );
    const steady = applyCoverLockTransition(locked, {
      width: 264,
      height: 720,
      screenWidth: RAZR_SCREEN_WIDTH,
    });
    assert.equal(steady.isCoverDisplay, true);
    assert.equal(steady.lockedCoverHeight, 720);
  });

  it("does not false-unlock when cover height is 750 (old height>=700 bug)", () => {
    const locked = applyCoverLockTransition(
      { lockedCoverWidth: 0, lockedCoverHeight: 0 },
      { width: 264, height: 750, screenWidth: RAZR_SCREEN_WIDTH }
    );
    const steady = applyCoverLockTransition(locked, {
      width: 264,
      height: 750,
      screenWidth: RAZR_SCREEN_WIDTH,
    });
    assert.equal(steady.isCoverDisplay, true);
  });

  it("resume probe does not unlock on cover screen", () => {
    const lock = { lockedCoverWidth: 264, lockedCoverHeight: 720 };
    assert.equal(shouldUnfoldOnResume(lock, 720), false);
    assert.equal(shouldUnfoldOnResume(lock, 750), false);
  });

  it("does not overwrite cover height baseline on steady-state syncs", () => {
    const locked = applyCoverLockTransition(
      { lockedCoverWidth: 0, lockedCoverHeight: 0 },
      { width: 264, height: 650, screenWidth: RAZR_SCREEN_WIDTH }
    );
    const steady = applyCoverLockTransition(locked, {
      width: 264,
      height: 680,
      screenWidth: RAZR_SCREEN_WIDTH,
    });
    assert.equal(steady.lockedCoverHeight, 650);
    assert.equal(steady.isCoverDisplay, true);
  });
});

describe("Razr unfold detection", () => {
  it("unlocks when height jumps after unfold (stale narrow meta width)", () => {
    const cover = applyCoverLockTransition(
      { lockedCoverWidth: 0, lockedCoverHeight: 0 },
      { width: 264, height: 720, screenWidth: RAZR_SCREEN_WIDTH }
    );
    assert.equal(cover.isCoverDisplay, true);

    const unfolded = applyCoverLockTransition(cover, {
      width: 264,
      height: 920,
      screenWidth: RAZR_SCREEN_WIDTH,
    });
    assert.equal(unfolded.isCoverDisplay, false);
    assert.equal(unfolded.lockedCoverWidth, 0);
  });

  it("does not re-lock in the same frame after height-based unfold", () => {
    const cover = { lockedCoverWidth: 264, lockedCoverHeight: 720 };
    const unfolded = applyCoverLockTransition(cover, {
      width: 264,
      height: 920,
      screenWidth: RAZR_SCREEN_WIDTH,
    });
    assert.equal(unfolded.isCoverDisplay, false);
  });

  it("resume probe unlocks after unfold height jump", () => {
    const lock = { lockedCoverWidth: 264, lockedCoverHeight: 720 };
    assert.equal(shouldUnfoldOnResume(lock, 920), true);
  });

  it("unlocks when full inner width is reported", () => {
    const result = applyCoverLockTransition(
      { lockedCoverWidth: 264, lockedCoverHeight: 650 },
      { width: 412, height: 920, screenWidth: RAZR_SCREEN_WIDTH }
    );
    assert.equal(result.isCoverDisplay, false);
    assert.equal(result.lockedCoverWidth, 0);
  });

  it("does not re-lock after stale-width unfold (height above cover strip)", () => {
    const cover = applyCoverLockTransition(
      { lockedCoverWidth: 0, lockedCoverHeight: 0 },
      { width: 264, height: 720, screenWidth: RAZR_SCREEN_WIDTH }
    );
    const unfolded = applyCoverLockTransition(cover, {
      width: 264,
      height: 920,
      screenWidth: 920,
    });
    assert.equal(unfolded.isCoverDisplay, false);
  });
});
