// Day boundary is 6AM: messages before 6AM belong to the previous calendar date.
export function deviceDayKey(date = new Date()) {
  const d = new Date(date);
  d.setHours(d.getHours() - 6);
  return d.toLocaleDateString('en-CA'); // YYYY-MM-DD
}

export function deviceTime(date = new Date()) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function deviceTimestamp(date = new Date()) {
  return {
    device_time: deviceTime(date),
    device_date: deviceDayKey(date),
  };
}

// Human-readable label for a YYYY-MM-DD key, with Today/Yesterday shortcuts.
export function deviceDayLabel(key) {
  const today = deviceDayKey();
  if (key === today) return 'Today';
  const d = new Date(today + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  if (key === d.toLocaleDateString('en-CA')) return 'Yesterday';
  return new Date(key + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });
}