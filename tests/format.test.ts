import { describe, expect, it } from 'vitest';
import { formatCoords, formatDate, formatDayLabel, formatINR, formatWeekRange, mapUrl } from '../src/lib/format';

describe('formatINR', () => {
  it('uses Indian digit grouping with no paise', () => {
    expect(formatINR(123456)).toBe('₹1,23,456');
    expect(formatINR(12345678.9)).toBe('₹1,23,45,679');
  });

  it('accepts Decimal strings as sent by the API', () => {
    expect(formatINR('2500.50')).toBe('₹2,501');
  });

  it('formats compact lakh / crore values', () => {
    expect(formatINR(150000, { compact: true })).toBe('₹1.5L');
    expect(formatINR(25_000_000, { compact: true })).toBe('₹2.5Cr');
  });

  it('renders a dash for non-numeric input', () => {
    expect(formatINR('abc')).toBe('—');
    expect(formatINR(Number.NaN)).toBe('—');
  });
});

describe('formatDate', () => {
  it('formats in Asia/Kolkata, not UTC', () => {
    // 20:00 UTC on 14 Oct is already 15 Oct in IST.
    expect(formatDate('2026-10-14T20:00:00Z')).toBe('15 Oct 2026');
    expect(formatDate(new Date('2026-10-14T06:00:00Z'))).toBe('14 Oct 2026');
  });

  it('renders a dash for invalid dates', () => {
    expect(formatDate('garbage')).toBe('—');
  });
});

describe('formatDayLabel', () => {
  // 10:00 IST on 15 Oct 2026
  const now = new Date('2026-10-15T04:30:00Z');

  it('labels today and yesterday by the IST calendar', () => {
    expect(formatDayLabel('2026-10-14T19:00:00Z', now)).toBe('Today'); // 00:30 IST 15 Oct
    expect(formatDayLabel('2026-10-14T18:00:00Z', now)).toBe('Yesterday'); // 23:30 IST 14 Oct
  });

  it('falls back to the full date for older days', () => {
    expect(formatDayLabel('2026-10-10T06:00:00Z', now)).toBe('10 Oct 2026');
  });
});

describe('formatWeekRange', () => {
  // Budget weeks are [Monday 00:00 IST, next Monday 00:00 IST) as UTC instants.
  it('formats a week inside one month compactly', () => {
    expect(formatWeekRange('2026-10-11T18:30:00.000Z', '2026-10-18T18:30:00.000Z')).toBe('12–18 Oct');
  });

  it('names both months when the week spans two', () => {
    expect(formatWeekRange('2026-09-27T18:30:00.000Z', '2026-10-04T18:30:00.000Z')).toBe('28 Sept – 4 Oct');
  });
});

describe('coordinates', () => {
  it('formats six decimal places', () => {
    expect(formatCoords(12.9716, 77.5946)).toBe('12.971600, 77.594600');
    expect(formatCoords(0, 0)).toBe('0.000000, 0.000000');
  });

  it('builds an OpenStreetMap link', () => {
    expect(mapUrl(12.9716, 77.5946)).toBe(
      'https://www.openstreetmap.org/?mlat=12.9716&mlon=77.5946#map=15/12.9716/77.5946',
    );
  });
});
