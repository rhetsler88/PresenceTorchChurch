import { getCodeDateKey } from "./dailyCode.js";

const DISMISS_KEY_PREFIX = "presence-earpiece-warn-";

export function earpieceWarningStorageKey(userId, dateKey = getCodeDateKey()) {
  return `${DISMISS_KEY_PREFIX}${userId}-${dateKey}`;
}

export function isEarpieceWarningDismissed(userId, dateKey = getCodeDateKey()) {
  if (!userId || typeof localStorage === "undefined") return true;
  return localStorage.getItem(earpieceWarningStorageKey(userId, dateKey)) === "1";
}

export function dismissEarpieceWarning(userId, dateKey = getCodeDateKey()) {
  if (!userId || typeof localStorage === "undefined") return;
  localStorage.setItem(earpieceWarningStorageKey(userId, dateKey), "1");
}
