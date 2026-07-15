const ETZ = 'America/New_York';

export function etzDayKey(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ETZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(date));
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

export function etzTime(date) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true
  }).format(new Date(date));
}

export function etzDateTime(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ETZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(new Date(date));
}

export function etzDateOnly(date) {
  return etzDayKey(date);
}

export function etzDateLabel(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ETZ, weekday: 'long', month: 'short', day: 'numeric', year: 'numeric'
  }).format(new Date(date));
}

export function etzFullTimestamp(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ETZ, month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  }).format(new Date(date));
}

export function etzMediumTimestamp(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ETZ, month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  }).format(new Date(date));
}

export function etzIsToday(date) {
  return etzDayKey(new Date()) === etzDayKey(date);
}

export function etzIsYesterday(date) {
  const todayKey = etzDayKey(new Date());
  const [y, m, d] = todayKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const yKey = dt.toISOString().slice(0, 10);
  return yKey === etzDayKey(date);
}

export function etzDayLabel(date) {
  if (etzIsToday(date)) return "Today";
  if (etzIsYesterday(date)) return "Yesterday";
  return etzDateLabel(date);
}