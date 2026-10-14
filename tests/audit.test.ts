import { describe, expect, it } from 'vitest';
import { invitationExpiry, INVITATION_TTL_DAYS } from '../src/lib/invitations';
import { parsePeriodParam, todayIST } from '../src/lib/period';
import { createTransactionSchema } from '../src/lib/validation/schemas';

describe('todayIST', () => {
  it('returns the IST calendar date (not UTC)', () => {
    // 20:00 UTC on 14 Oct == 01:30 IST on 15 Oct
    expect(todayIST(new Date('2026-10-14T20:00:00Z'))).toBe('2026-10-15');
    // 06:00 UTC on 14 Oct == 11:30 IST on 14 Oct
    expect(todayIST(new Date('2026-10-14T06:00:00Z'))).toBe('2026-10-14');
  });
});

describe('invitationExpiry', () => {
  it('is the default TTL in the future', () => {
    const from = new Date('2026-10-14T00:00:00Z');
    const exp = invitationExpiry(from);
    expect(exp.getTime() - from.getTime()).toBe(INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
    expect(exp.getTime()).toBeGreaterThan(Date.now() - 1);
  });
});

describe('parsePeriodParam ranges', () => {
  it('rejects out-of-range months and days', () => {
    expect(parsePeriodParam('month', '2026-13')).toBeNull();
    expect(parsePeriodParam('month', '2026-00')).toBeNull();
    expect(parsePeriodParam('week', '2026-02-31')).toBeNull();
    expect(parsePeriodParam('week', '2026-04-31')).toBeNull();
  });

  it('accepts valid periods', () => {
    expect(parsePeriodParam('month', '2026-10')).not.toBeNull();
    expect(parsePeriodParam('week', '2026-10-14')).not.toBeNull();
    expect(parsePeriodParam('week', '2026-02-28')).not.toBeNull();
  });
});

describe('money validation', () => {
  const base = {
    categoryId: 'c1',
    occurredAt: new Date(Date.now() - 1000),
    paymentMode: 'cash' as const,
  };

  it('accepts two-decimal amounts', () => {
    expect(createTransactionSchema.safeParse({ ...base, amount: 1234.56 }).success).toBe(true);
  });

  it('rejects more than two decimal places', () => {
    expect(createTransactionSchema.safeParse({ ...base, amount: 10.005 }).success).toBe(false);
  });

  it('rejects amounts beyond Decimal(12,2) range', () => {
    expect(createTransactionSchema.safeParse({ ...base, amount: 1e10 }).success).toBe(false);
  });
});
