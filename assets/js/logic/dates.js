// Date helpers. All "calendar days" are ISO strings (YYYY-MM-DD) computed in
// the user's configured timezone (default Asia/Qatar), never the device's.

export const DEFAULT_TZ = 'Asia/Qatar';
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parts(date, tz) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || DEFAULT_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const o = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  return o;
}

/** Calendar date (YYYY-MM-DD) for an instant in a timezone. */
export function isoInTz(date = new Date(), tz = DEFAULT_TZ) {
  const p = parts(date, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutes since local midnight in the timezone. */
export function minutesInTz(date = new Date(), tz = DEFAULT_TZ) {
  const p = parts(date, tz);
  return Number(p.hour) * 60 + Number(p.minute);
}

export const todayISO = (tz) => isoInTz(new Date(), tz);

function toUTC(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`Invalid date: ${iso}`);
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** 0 = Sunday … 6 = Saturday, for a calendar date. */
export const weekdayOf = (iso) => toUTC(iso).getUTCDay();

export function addDays(iso, n) {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const diffDays = (a, b) => Math.round((toUTC(a) - toUTC(b)) / 86400000);

export function rangeDays(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function formatLong(iso) {
  return toUTC(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
export function formatShort(iso) {
  return toUTC(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** "16:30:00" → minutes */
export function timeToMinutes(t) {
  const [h, m] = String(t || '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
}
export function minutesToLabel(min) {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0');
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${mm} ${suffix}`;
}

export function durationLabel(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
