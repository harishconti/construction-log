import { describe, expect, it } from 'vitest';
import {
  INVITE_LINK_TTL_DAYS,
  hashInviteToken,
  inviteLinkExpiry,
  inviteLinkPath,
  inviteLinkState,
  isInviteToken,
  newInviteToken,
} from '../src/lib/invite-links';
import { authCompletePath, safeNextPath } from '../src/lib/safe-next';

describe('invite link tokens', () => {
  it('are 43-char base64url, unique, and stored only as their SHA-256', () => {
    const a = newInviteToken();
    const b = newInviteToken();
    expect(isInviteToken(a.token)).toBe(true);
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).toBe(hashInviteToken(a.token));
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.tokenHash).not.toContain(a.token);
  });

  it('rejects malformed tokens before any lookup', () => {
    for (const bad of ['', 'short', 'x'.repeat(44), `${'a'.repeat(42)}!`, '../../etc/passwd']) {
      expect(isInviteToken(bad), bad).toBe(false);
    }
  });

  it('builds the share path', () => {
    expect(inviteLinkPath('abc')).toBe('/invite/abc');
  });
});

describe('inviteLinkState', () => {
  const now = new Date('2026-10-15T00:00:00Z');
  const base = { usedAt: null, revokedAt: null, expiresAt: inviteLinkExpiry(now) };

  it(`is active for ${INVITE_LINK_TTL_DAYS} days`, () => {
    expect(inviteLinkState(base, now)).toBe('active');
    expect(inviteLinkState(base, new Date(base.expiresAt.getTime() - 1))).toBe('active');
    expect(inviteLinkState(base, base.expiresAt)).toBe('expired');
  });

  it('revoked beats used beats expired', () => {
    const past = new Date('2020-01-01T00:00:00Z');
    expect(inviteLinkState({ usedAt: now, revokedAt: now, expiresAt: past }, now)).toBe('revoked');
    expect(inviteLinkState({ usedAt: now, revokedAt: null, expiresAt: past }, now)).toBe('used');
  });
});

describe('safeNextPath (no open redirects)', () => {
  it('keeps same-origin paths with queries', () => {
    expect(safeNextPath('/invite/abc?join=1')).toBe('/invite/abc?join=1');
    expect(safeNextPath('/projects/x/diary')).toBe('/projects/x/diary');
  });

  it.each(['//evil.com', '/\\evil.com', 'https://evil.com', 'evil.com', '', null, undefined, '/a\nb', `/${'x'.repeat(600)}`])(
    'falls back for %j',
    (raw) => {
      expect(safeNextPath(raw)).toBe('/projects');
    },
  );

  it('authCompletePath encodes the (sanitised) target', () => {
    expect(authCompletePath('/invite/abc?join=1')).toBe('/auth/complete?next=%2Finvite%2Fabc%3Fjoin%3D1');
    expect(authCompletePath('//evil.com')).toBe('/auth/complete?next=%2Fprojects');
  });
});
