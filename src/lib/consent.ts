import { prisma } from './prisma';
import { POLICY_VERSION } from './legal';

export type ActiveConsent = {
  id: string;
  policyVersion: string;
  purposes: string[];
  grantedAt: Date;
};

/** The newest non-withdrawn consent for the **current** policy version, or null. */
export async function getActiveConsent(userId: string): Promise<ActiveConsent | null> {
  const row = await prisma.consentRecord.findFirst({
    where: { userId, withdrawnAt: null, policyVersion: POLICY_VERSION },
    orderBy: { grantedAt: 'desc' },
    select: { id: true, policyVersion: true, purposes: true, grantedAt: true },
  });
  if (!row) return null;
  return { ...row, purposes: toStringArray(row.purposes) };
}

/**
 * True when the account has accepted the current Terms/Privacy notice. Used by the app shell to
 * send anyone who has not (a new sign-up, or an existing user after a policy-version bump) through
 * the consent gate before they can reach project data.
 */
export async function hasCurrentConsent(userId: string): Promise<boolean> {
  const consent = await getActiveConsent(userId);
  return consent !== null;
}

/** `/consent?next=…` — the gate target, preserving where the user was heading. */
export function consentGatePath(next: string): string {
  return `/consent?next=${encodeURIComponent(next)}`;
}

/** `purposes` is a JSONB column; be defensive about its runtime shape. */
export function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** The pending (or most recent) erasure request for an account, if any. */
export async function getDeletionRequest(userId: string) {
  return prisma.deletionRequest.findFirst({
    where: { userId },
    orderBy: { requestedAt: 'desc' },
    select: { id: true, status: true, reason: true, requestedAt: true, scheduledFor: true, completedAt: true },
  });
}
