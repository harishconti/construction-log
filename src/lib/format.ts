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
