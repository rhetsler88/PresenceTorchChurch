/**
 * What App Store Connect accepts for a screenshot, in one place, so the
 * exporter, the validator script, and the tests cannot disagree about it.
 */

/** The frames, in reviewer-facing order. */
export const FRAME_FILES = ["01-signin.jpg", "02-daily-code.jpg", "03-talk.jpg"];

/**
 * An iPad slot only ships frames captured at an iPad viewport. Scaling a phone
 * capture onto a 3:4 canvas leaves an iPhone status bar and keyboard bar
 * sitting in the middle of a wide screen, which reads as the wrong device.
 */
const IPAD_FRAMES = ["01-signin.jpg"];

/** Portrait sizes Apple accepts for the slots this app ships. */
export const SLOTS = [
  { dir: "iphone-6.9-inch-1320x2868", label: '6.9" Display', width: 1320, height: 2868, formFactor: "phone", frames: FRAME_FILES },
  { dir: "iphone-6.9-inch-1290x2796", label: '6.9" Display (alternate)', width: 1290, height: 2796, formFactor: "phone", frames: FRAME_FILES },
  { dir: "iphone-6.5-inch-1284x2778", label: '6.5" Display', width: 1284, height: 2778, formFactor: "phone", frames: FRAME_FILES },
  { dir: "iphone-6.5-inch-1242x2688", label: '6.5" Display (alternate)', width: 1242, height: 2688, formFactor: "phone", frames: FRAME_FILES },
  { dir: "iphone-5.5-inch-1242x2208", label: '5.5" Display', width: 1242, height: 2208, formFactor: "phone", frames: FRAME_FILES },
  { dir: "ipad-13-inch-2064x2752", label: 'iPad 13" Display', width: 2064, height: 2752, formFactor: "ipad", frames: IPAD_FRAMES },
  { dir: "ipad-13-inch-2048x2732", label: 'iPad 13" Display (alternate)', width: 2048, height: 2732, formFactor: "ipad", frames: IPAD_FRAMES },
];

export const MAX_BYTES = 8 * 1024 * 1024;

export function findSlot(width, height) {
  return SLOTS.find((slot) => slot.width === width && slot.height === height) ?? null;
}

/**
 * Every reason App Store Connect would refuse an image, worst first. Takes
 * plain metadata rather than a path so it stays testable without fixtures.
 *
 * An empty array means the file is uploadable and the slot is whatever
 * `findSlot` returns for its size.
 */
export function findUploadProblems({ format, width, height, channels, hasAlpha, space, isProgressive, bytes }) {
  const problems = [];

  if (format !== "jpeg" && format !== "png") {
    problems.push(`format is ${format}, but App Store Connect takes only JPG or PNG`);
  }
  if (!findSlot(width, height)) {
    const accepted = SLOTS.map((slot) => `${slot.width}x${slot.height}`).join(", ");
    problems.push(`${width}x${height} is not an accepted slot size; Apple takes ${accepted}`);
  }
  if (hasAlpha || channels === 4) {
    problems.push("has an alpha channel, which Apple rejects; flatten it onto a solid background");
  }
  if (space && space !== "srgb") {
    problems.push(`color space is ${space}, but Apple needs RGB`);
  }
  // Progressive JPEG and interlaced PNG both decode fine in browsers but are
  // the likeliest thing a strict uploader chokes on, so flag them.
  if (isProgressive) {
    problems.push("is progressive/interlaced; re-encode it as baseline");
  }
  if (bytes > MAX_BYTES) {
    problems.push(`is ${(bytes / 1024 / 1024).toFixed(1)}MB, over the 8MB cap`);
  } else if (bytes < 10_000) {
    problems.push(`is only ${bytes} bytes, which looks like a placeholder or a broken download`);
  }

  return problems;
}
