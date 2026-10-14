// Regression: date-only inputs must mean midnight in Asia/Kolkata, not UTC. Between 00:00 and
// 05:30 IST, "today" parsed as UTC midnight is still in the future and was rejected (found by
// the authed e2e suite at 00:13 IST).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { istDateToInstant, istDayEnd, todayIST } from '../src/lib/period';
import {
  createDiarySchema,
  createProjectSchema,
  createTransactionSchema,
} from '../src/lib/validation/schemas';

// 00:13 IST on 15 Oct 2026 == 18:43 UTC on 14 Oct.
const NOW = new Date('2026-10-14T18:43:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('IST date helpers', () => {
  it('maps a calendar date to IST midnight and end of day', () => {
    expect(istDateToInstant('2026-10-15').toISOString()).toBe('2026-10-14T18:30:00.000Z');
    expect(istDayEnd('2026-10-15').toISOString()).toBe('2026-10-15T18:29:59.999Z');
  });

  it('round-trips with todayIST', () => {
    expect(todayIST(istDateToInstant('2026-10-15'))).toBe('2026-10-15');
    expect(todayIST(istDayEnd('2026-10-15'))).toBe('2026-10-15');
  });
});

describe('date-only inputs are IST calendar dates', () => {
  const tx = { categoryId: 'c', amount: 10, paymentMode: 'cash' as const };

  it('accepts today (IST) just after midnight IST', () => {
    const today = todayIST();
    expect(today).toBe('2026-10-15');
    const parsed = createTransactionSchema.parse({ ...tx, occurredAt: today });
    expect(parsed.occurredAt.toISOString()).toBe('2026-10-14T18:30:00.000Z');
    expect(createDiarySchema.parse({ entryDate: today, title: 't', body: '' }).entryDate.toISOString()).toBe(
      '2026-10-14T18:30:00.000Z',
    );
    expect(createProjectSchema.parse({ name: 'p', startDate: today }).startDate.toISOString()).toBe(
      '2026-10-14T18:30:00.000Z',
    );
  });

  it('still rejects tomorrow (IST)', () => {
    expect(() => createTransactionSchema.parse({ ...tx, occurredAt: '2026-10-16' })).toThrow(/future/);
  });

  it('rejects impossible calendar dates instead of rolling them over', () => {
    expect(() => createTransactionSchema.parse({ ...tx, occurredAt: '2026-02-30' })).toThrow();
    expect(() => createTransactionSchema.parse({ ...tx, occurredAt: '2026-13-01' })).toThrow();
  });

  it('keeps accepting full ISO timestamps unchanged', () => {
    const parsed = createTransactionSchema.parse({ ...tx, occurredAt: '2026-10-14T06:00:00.000Z' });
    expect(parsed.occurredAt.toISOString()).toBe('2026-10-14T06:00:00.000Z');
  });
});
