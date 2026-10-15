import { createHash, randomBytes } from 'node:crypto';

export const INVITE_LINK_TTL_DAYS = 7;

/** base64url of 32 random bytes = 43 chars. */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export type InviteLinkState = 'active' | 'used' | 'revoked' | 'expired';

/** A fresh link token and the hash we store. The raw token is never persisted. */
export function newInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Cheap shape check before touching the database (also keeps junk out of logs and queries). */
export function isInviteToken(value: string): boolean {
  return TOKEN_RE.test(value);
}

export function inviteLinkExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function inviteLinkState(
  link: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date = new Date(),
): InviteLinkState {
  if (link.revokedAt) return 'revoked';
  if (link.usedAt) return 'used';
  if (link.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}

export function inviteLinkPath(token: string): string {
  return `/invite/${token}`;
}
