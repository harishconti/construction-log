/** Formatting helpers. Money in Indian rupees; dates in Asia/Kolkata. */

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inrCompact = new Intl.NumberFormat('en-IN', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** ₹1,23,456 (default) or ₹1.2L / ₹1.2Cr when `compact`. */
export function formatINR(value: number | string, opts: { compact?: boolean } = {}): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return opts.compact ? `₹${inrCompact.format(n)}` : inr.format(n);
}

/** `14 Oct 2026` in Asia/Kolkata. */
export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(d);
}

/** `Today` / `Yesterday` / `14 Oct 2026`, evaluated against the IST calendar. */
export function formatDayLabel(value: string | Date, now: Date = new Date()): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  const key = (x: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(x);
  const target = key(d);
  if (target === key(now)) return 'Today';
  if (target === key(new Date(now.getTime() - 86400000))) return 'Yesterday';
  return formatDate(d);
}

/** `12–18 Oct`, or `28 Sept – 4 Oct` across months, for a [start, endExclusive) week in IST. */
export function formatWeekRange(start: string | Date, endExclusive: string | Date): string {
  const s = new Date(start);
  const e = new Date(new Date(endExclusive).getTime() - 1);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '—';
  const part = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: 'Asia/Kolkata' }).format(d);
  const sMonth = part(s, { month: 'short' });
  const eMonth = part(e, { month: 'short' });
  const sDay = part(s, { day: 'numeric' });
  const eDay = part(e, { day: 'numeric' });
  return sMonth === eMonth ? `${sDay}–${eDay} ${eMonth}` : `${sDay} ${sMonth} – ${eDay} ${eMonth}`;
}

/** `12.971600, 77.594600` — six decimal places (≈10 cm). */
export function formatCoords(latitude: number, longitude: number): string {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

/** OpenStreetMap link for a coordinate pair (no API key, usable from a CSP-restricted page). */
export function mapUrl(latitude: number, longitude: number): string {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`;
}
