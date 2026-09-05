import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Mirrors name token parsing in userUtils.js */
function nameTokensForInitials(name) {
  return (name || "")
    .trim()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[()[\]{}]/g, " ")
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word));
}

function getInitialsFromName(name) {
  const words = nameTokensForInitials(name);
  if (words.length >= 2) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return "?";
}

describe("getInitialsFromName", () => {
  it("uses first and last alphabetic tokens", () => {
    assert.equal(getInitialsFromName("Safety TL (Ryan)"), "ST");
    assert.equal(getInitialsFromName("Jane Doe"), "JD");
  });

  it("uses first two letters for a single token", () => {
    assert.equal(getInitialsFromName("Safety"), "SA");
  });

  it("ignores parenthetical nicknames for title-style names", () => {
    assert.equal(getInitialsFromName("Safety TL (Ryan)"), "ST");
  });
});
