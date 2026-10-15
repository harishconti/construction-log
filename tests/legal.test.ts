import { describe, expect, it } from 'vitest';
import {
  CONSENT_PURPOSES,
  DELETION_GRACE_DAYS,
  POLICY_VERSION,
  REQUIRED_PURPOSES,
  deletionScheduledFor,
  isConsentPurposeKey,
  missingRequiredPurposes,
} from '../src/lib/legal';

const DAY = 24 * 60 * 60 * 1000;

describe('consent purposes', () => {
  it('defines unique purposes with at least one required and one optional', () => {
    const keys = CONSENT_PURPOSES.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(REQUIRED_PURPOSES.length).toBeGreaterThan(0);
    expect(CONSENT_PURPOSES.some((p) => !p.required)).toBe(true);
    for (const p of CONSENT_PURPOSES) {
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
    }
  });

  it('lists the required purposes in REQUIRED_PURPOSES', () => {
    const required = CONSENT_PURPOSES.filter((p) => p.required).map((p) => p.key);
    expect([...REQUIRED_PURPOSES].sort()).toEqual([...required].sort());
  });

  it('flags required purposes that are missing from a grant', () => {
    expect(missingRequiredPurposes([...REQUIRED_PURPOSES])).toEqual([]);
    expect(missingRequiredPurposes([])).toEqual(REQUIRED_PURPOSES);
    expect(missingRequiredPurposes([REQUIRED_PURPOSES[0], 'service_messages'])).toEqual(
      REQUIRED_PURPOSES.slice(1),
    );
  });

  it('recognises only known purpose keys', () => {
    for (const p of CONSENT_PURPOSES) expect(isConsentPurposeKey(p.key)).toBe(true);
    expect(isConsentPurposeKey('marketing')).toBe(false);
  });

  it('exposes a versioned policy identifier', () => {
    expect(POLICY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('deletionScheduledFor', () => {
  it('schedules the request one grace period ahead without mutating the input', () => {
    const from = new Date('2026-10-15T00:00:00Z');
    const snapshot = from.getTime();
    const due = deletionScheduledFor(from);
    expect(from.getTime()).toBe(snapshot);
    expect(due.getTime()).toBeGreaterThan(from.getTime());
    const delta = due.getTime() - from.getTime();
    // setDate is calendar-based; allow a day's slack for time zones with a DST change.
    expect(delta).toBeGreaterThanOrEqual((DELETION_GRACE_DAYS - 1) * DAY);
    expect(delta).toBeLessThanOrEqual((DELETION_GRACE_DAYS + 1) * DAY);
  });

  it('honours a custom grace period', () => {
    const from = new Date('2026-10-15T00:00:00Z');
    const due = deletionScheduledFor(from, 7);
    expect(due.getTime() - from.getTime()).toBeGreaterThanOrEqual(6 * DAY);
    expect(due.getTime() - from.getTime()).toBeLessThanOrEqual(8 * DAY);
  });
});
