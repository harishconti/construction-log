import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getActiveConsent, getDeletionRequest } from '@/lib/consent';
import { CONSENT_PURPOSES, DELETION_GRACE_DAYS, POLICY_VERSION } from '@/lib/legal';
import { AccountView } from '@/components/AccountView';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Account · Construction Ledger' };

/**
 * The privacy control centre: current consent, optional-purpose preferences, and the account
 * deletion / consent-withdrawal flow. Deliberately not behind the consent gate so data rights are
 * reachable even before a user has accepted the current notice.
 */
export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Faccount');

  const [consent, deletion] = await Promise.all([
    getActiveConsent(user.id),
    getDeletionRequest(user.id),
  ]);

  return (
    <AccountView
      key={consent ? consent.grantedAt.toISOString() : 'none'}
      user={user}
      consent={
        consent
          ? {
              policyVersion: consent.policyVersion,
              grantedAt: consent.grantedAt.toISOString(),
              purposes: consent.purposes,
            }
          : null
      }
      deletion={
        deletion
          ? {
              status: deletion.status,
              requestedAt: deletion.requestedAt.toISOString(),
              scheduledFor: deletion.scheduledFor.toISOString(),
              completedAt: deletion.completedAt?.toISOString() ?? null,
            }
          : null
      }
      purposes={CONSENT_PURPOSES}
      policyVersion={POLICY_VERSION}
      graceDays={DELETION_GRACE_DAYS}
    />
  );
}
