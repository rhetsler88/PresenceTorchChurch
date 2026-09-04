/** @typedef {{ lockedCoverWidth: number, lockedCoverHeight: number }} CoverLockState */
/** @typedef {{ width: number, height: number, screenWidth: number }} ViewportDims */

/**
 * Motorola Razr–style cover/unfold lock transitions (pure, testable).
 * Height baseline is captured once when cover lock starts; unfold is detected
 * when height grows >25% above that baseline while width is still narrow.
 */
export function applyCoverLockTransition(
  /** @type {CoverLockState} */ lock,
  /** @type {ViewportDims} */ { width, height, screenWidth }
) {
  let { lockedCoverWidth, lockedCoverHeight } = lock;
  let unfoldedThisFrame = false;

  if (lockedCoverWidth > 0 && lockedCoverHeight > 0) {
    if (height > lockedCoverHeight * 1.25) {
      lockedCoverWidth = 0;
      lockedCoverHeight = 0;
      unfoldedThisFrame = true;
    }
  }

  if (width >= 400) {
    lockedCoverWidth = 0;
    lockedCoverHeight = 0;
    unfoldedThisFrame = true;
  }

  const looksLikeCover =
    !unfoldedThisFrame &&
    width > 0 &&
    width < 400 &&
    height < 850 &&
    screenWidth > width * 1.3;

  if (looksLikeCover) {
    if (lockedCoverWidth === 0) {
      lockedCoverWidth = width;
      lockedCoverHeight = height;
    } else {
      lockedCoverWidth = width;
    }
  }

  return {
    lockedCoverWidth,
    lockedCoverHeight,
    isCoverDisplay: lockedCoverWidth > 0,
  };
}

/** Resume probe — height ratio only, uses baseline captured at cover lock. */
export function shouldUnfoldOnResume(
  /** @type {CoverLockState} */ lock,
  /** @type {number} */ height
) {
  if (lock.lockedCoverWidth === 0 || lock.lockedCoverHeight === 0) return false;
  return height > lock.lockedCoverHeight * 1.25;
}
