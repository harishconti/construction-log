import { describe, expect, it } from 'vitest';
import { computeVariance, statusFor } from '../src/lib/budget';
import {
  isPeriodStartAligned,
  nextPeriodStart,
  parsePeriodParam,
  startOfMonthIST,
  startOfWeekIST,
} from '../src/lib/period';

// 00:00 IST == previous day 18:30 UTC
const iso = (d: Date) => d.toISOString();

describe('period math (Asia/Kolkata)', () => {
  it('start of month for 2026-10-14 == 2026-10-01 00:00 IST', () => {
    expect(iso(startOfMonthIST(new Date('2026-10-14T06:00:00Z')))).toBe('2026-09-30T18:30:00.000Z');
  });

  it('start of week (Monday) for Wed 2026-10-14 == 2026-10-12 00:00 IST', () => {
    expect(iso(startOfWeekIST(new Date('2026-10-14T06:00:00Z')))).toBe('2026-10-11T18:30:00.000Z');
  });

  it('next month start crosses the IST boundary correctly', () => {
    const oct = startOfMonthIST(new Date('2026-10-14T06:00:00Z'));
    expect(iso(nextPeriodStart('month', oct))).toBe('2026-10-31T18:30:00.000Z');
  });

  it('alignment checks', () => {
    expect(isPeriodStartAligned('month', new Date('2026-09-30T18:30:00.000Z'))).toBe(true);
    expect(isPeriodStartAligned('month', new Date('2026-10-05T18:30:00.000Z'))).toBe(false);
    expect(isPeriodStartAligned('week', new Date('2026-10-11T18:30:00.000Z'))).toBe(true);
  });

  it('parses period params', () => {
    expect(iso(parsePeriodParam('month', '2026-10')!)).toBe('2026-09-30T18:30:00.000Z');
    expect(iso(parsePeriodParam('week', '2026-10-14')!)).toBe('2026-10-11T18:30:00.000Z');
    expect(parsePeriodParam('month', 'nope')).toBeNull();
  });
});

describe('budget variance', () => {
  it('green under 80%, yellow 80-100%, red over 100%', () => {
    expect(statusFor(50)).toBe('green');
    expect(statusFor(79.9)).toBe('green');
    expect(statusFor(80)).toBe('yellow');
    expect(statusFor(100)).toBe('yellow');
    expect(statusFor(100.1)).toBe('red');
  });

  it('computes variance and percent used', () => {
    const v = computeVariance(100000, 90000);
    expect(v.percentUsed).toBe(90);
    expect(v.variance).toBe(10000);
    expect(v.status).toBe('yellow');
  });

  it('returns null percent/status when there is no plan', () => {
    const v = computeVariance(0, 5000);
    expect(v.percentUsed).toBeNull();
    expect(v.status).toBeNull();
    expect(v.variance).toBe(-5000);
  });
});
