/** @typedef {{ lockedCoverWidth: number, lockedCoverHeight: number, hasUnfolded: boolean }} CoverLockState */
/** @typedef {{ width: number, height: number, layoutWidth: number, screenWidth: number }} ViewportDims */

/**
 * Motorola Razr cover/unfold state machine.
 * Cover entry: narrow visible width on a much wider physical screen, or layout/viewport mismatch.
 * Unfold exit: full width reported, or height jump while width meta is still stale.
 */
export function applyCoverLockTransition(
  /** @type {CoverLockState} */ lock,
  /** @type {ViewportDims} */ { width, height, layoutWidth, screenWidth }
) {
  let { lockedCoverWidth, lockedCoverHeight, hasUnfolded } = lock;

  if (lockedCoverWidth > 0) {
    const unfoldedByHeight =
      lockedCoverHeight > 0 && height > lockedCoverHeight * 1.25;
    if (width >= 400 || unfoldedByHeight) {
      return {
        lockedCoverWidth: 0,
        lockedCoverHeight: 0,
        hasUnfolded: true,
        isCoverDisplay: false,
      };
    }
    if (width > 0 && width < 400) {
      lockedCoverWidth = width;
    }
    return {
      lockedCoverWidth,
      lockedCoverHeight,
      hasUnfolded,
      isCoverDisplay: true,
    };
  }

  const layoutMismatch =
    layoutWidth > 0 && width > 0 && layoutWidth > width * 1.15;
  const narrowOnLargeScreen =
    width > 0 && width < 400 && screenWidth > width * 1.3;
  const looksLikeCover = layoutMismatch || narrowOnLargeScreen;

  // After unfold, wait for height to drop before re-locking (stale narrow width persists briefly).
  const backOnCoverStrip = height < 800;
  if (looksLikeCover && (!hasUnfolded || backOnCoverStrip)) {
    lockedCoverWidth = width;
    lockedCoverHeight = height;
    hasUnfolded = false;
    return {
      lockedCoverWidth,
      lockedCoverHeight,
      hasUnfolded,
      isCoverDisplay: true,
    };
  }

  if (width >= 400) {
    hasUnfolded = true;
  }

  return {
    lockedCoverWidth: 0,
    lockedCoverHeight: 0,
    hasUnfolded,
    isCoverDisplay: false,
  };
}

/** Resume probe — height ratio only, uses baseline captured at cover lock. */
export function shouldUnfoldOnResume(
  /** @type {Pick<CoverLockState, "lockedCoverWidth" | "lockedCoverHeight">} */ lock,
  /** @type {number} */ height
) {
  if (lock.lockedCoverWidth === 0 || lock.lockedCoverHeight === 0) return false;
  return height > lock.lockedCoverHeight * 1.25;
}
