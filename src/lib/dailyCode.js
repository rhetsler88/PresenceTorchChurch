const ETZ = 'America/New_York';

/**
 * Returns the date key (yyyy-MM-dd) for the current daily code period.
 * The code "day" starts at 0600 ET — before 0600, the previous day's code is still active.
 */
export function getCodeDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ETZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false
  }).formatToParts(date);
  const get = (type) => parts.find(p => p.type === type).value;
  const y = get('year');
  const m = get('month');
  const d = get('day');
  const h = parseInt(get('hour'), 10) % 24;

  if (h < 6) {
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

/**
 * Generates a deterministic 7-digit code for the current code period.
 * The same code is produced for all users on the same day.
 */
export function getDailyCode(date = new Date()) {
  const dateKey = getCodeDateKey(date);
  const salt = "PP-DailyAccess-2026";
  const input = dateKey + salt;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash = hash & hash;
  }
  const code = Math.abs(hash) % 10000000;
  return code.toString().padStart(7, '0');
}