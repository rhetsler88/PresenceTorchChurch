import { normalizeOrganization } from "@/lib/userUtils";

const ETZ = 'America/New_York';
const ROLLOVER_HOUR_ET = 0;
const ROLLOVER_MINUTE_ET = 1;

export const DAILY_CODE_SESSION_KEY = 'presence-daily-code-session';

/**
 * Returns the date key (yyyy-MM-dd) for the current daily code period.
 * The code "day" starts at 12:01 AM ET — through 12:00:59 AM, the previous day's code is still active.
 */
export function getCodeDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ETZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date);
  const get = (type) => parts.find(p => p.type === type).value;
  const y = get('year');
  const m = get('month');
  const d = get('day');
  const h = parseInt(get('hour'), 10) % 24;
  const min = parseInt(get('minute'), 10);

  if (h === ROLLOVER_HOUR_ET && min < ROLLOVER_MINUTE_ET) {
    const prev = new Date(date);
    prev.setDate(prev.getDate() - 1);
    const prevParts = new Intl.DateTimeFormat('en-US', {
      timeZone: ETZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(prev);
    const pGet = (type) => prevParts.find(p => p.type === type).value;
    return `${pGet('year')}-${pGet('month')}-${pGet('day')}`;
  }
  return `${y}-${m}-${d}`;
}

/** Human-readable rollover time for UI copy. */
export function getCodeRolloverLabel() {
  return '12:01 AM ET';
}

export function markDailyCodeSession() {
  try {
    sessionStorage.setItem(DAILY_CODE_SESSION_KEY, '1');
  } catch {
    // sessionStorage unavailable (private mode, etc.)
  }
}

export function hasDailyCodeSession() {
  try {
    return sessionStorage.getItem(DAILY_CODE_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearDailyCodeSession() {
  try {
    sessionStorage.removeItem(DAILY_CODE_SESSION_KEY);
  } catch {
    // ignore
  }
}

/** True when the user may enter the app (Firestore date matches or same browser session). */
export function isDailyCodeVerified(user) {
  if (!user) return false;
  if (user.daily_code_verified_date === getCodeDateKey()) {
    markDailyCodeSession();
    return true;
  }
  return hasDailyCodeSession();
}

/**
 * Generates a deterministic 7-digit code for the current code period scoped to one organization.
 * Each organization gets a unique code per day; users in other orgs cannot use it.
 */
export function getDailyCode(organization, date = new Date()) {
  const orgKey = normalizeOrganization(organization);
  if (!orgKey) return null;

  const dateKey = getCodeDateKey(date);
  const salt = "PP-DailyAccess-2026";
  const input = `${dateKey}:${orgKey}:${salt}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash = hash & hash;
  }
  const code = Math.abs(hash) % 10000000;
  return code.toString().padStart(7, '0');
}

/** Convenience wrapper — returns null when the user has no organization. */
export function getDailyCodeForUser(user, date = new Date()) {
  return getDailyCode(user?.organization, date);
}
