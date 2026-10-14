import { describe, expect, it } from 'vitest';
import { providedMaintenanceSecret, secretMatches } from '../src/lib/maintenance';

describe('maintenance auth', () => {
  it('matches only exact secrets', () => {
    expect(secretMatches('abc', ['abc'])).toBe(true);
    expect(secretMatches('abc', ['xyz'])).toBe(false);
    expect(secretMatches('abc', ['abcd'])).toBe(false);
    expect(secretMatches(null, ['abc'])).toBe(false);
    expect(secretMatches('abc', [])).toBe(false);
  });

  it('accepts any of multiple secrets', () => {
    expect(secretMatches('b', ['a', 'b'])).toBe(true);
  });

  it('reads the secret from either header', () => {
    const headers = (map: Record<string, string>) => (name: string) => map[name] ?? null;
    expect(providedMaintenanceSecret(headers({ 'x-maintenance-secret': 'k' }))).toBe('k');
    expect(providedMaintenanceSecret(headers({ authorization: 'Bearer k2' }))).toBe('k2');
    expect(providedMaintenanceSecret(headers({}))).toBeNull();
  });
});
