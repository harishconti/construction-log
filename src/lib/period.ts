// Budget period math. Wall-clock boundaries use Asia/Kolkata (UTC+05:30);
// weeks start Monday. Period starts are stored as the UTC instant of 00:00 IST.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type Granularity = 'week' | 'month';

function istParts(d: Date) {
  const t = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth(),
    day: t.getUTCDate(),
    dow: t.getUTCDay(), // 0=Sun..6=Sat
  };
}

function istMidnightUtc(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m, day, 0, 0, 0) - IST_OFFSET_MS);
}

/** 00:00 IST on the 1st of `d`'s IST month, as a UTC instant. */
export function startOfMonthIST(d: Date): Date {
  const { y, m } = istParts(d);
  return istMidnightUtc(y, m, 1);
}

/** 00:00 IST on the Monday of `d`'s IST week, as a UTC instant. */
export function startOfWeekIST(d: Date): Date {
  const { y, m, day, dow } = istParts(d);
  const delta = (dow + 6) % 7; // Monday=0
  const t = new Date(Date.UTC(y, m, day));
  t.setUTCDate(t.getUTCDate() - delta);
  return istMidnightUtc(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}

export function normalizePeriodStart(g: Granularity, d: Date): Date {
  return g === 'week' ? startOfWeekIST(d) : startOfMonthIST(d);
}

export function isPeriodStartAligned(g: Granularity, d: Date): boolean {
  return normalizePeriodStart(g, d).getTime() === d.getTime();
}

export function nextPeriodStart(g: Granularity, start: Date): Date {
  if (g === 'week') return new Date(start.getTime() + 7 * MS_PER_DAY);
  const { y, m } = istParts(start);
  return istMidnightUtc(y, m + 1, 1);
}

export function periodRange(g: Granularity, start: Date): { start: Date; end: Date } {
  return { start, end: nextPeriodStart(g, start) };
}

/**
 * Parses a period query param into a normalized period start.
 * month: `YYYY-MM`  |  week: `YYYY-MM-DD` (any date within the week).
 * Returns null if malformed.
 */
export function parsePeriodParam(g: Granularity, period: string): Date | null {
  if (g === 'month') {
    const m = /^(\d{4})-(\d{2})$/.exec(period);
    if (!m) return null;
    return istMidnightUtc(Number(m[1]), Number(m[2]) - 1, 1);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period);
  if (!m) return null;
  return normalizePeriodStart('week', new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
}
