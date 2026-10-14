export const INVITATION_TTL_DAYS = 14;

/** Expiry for a pending invitation (default TTL from now). */
export function invitationExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}
