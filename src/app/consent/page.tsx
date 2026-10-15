import { redirect } from 'next/navigation';
import { getActiveConsent } from '@/lib/consent';
import { getCurrentUser } from '@/lib/auth';
import { safeNextPath } from '@/lib/safe-next';
import { CONSENT_PURPOSES, POLICY_VERSION } from '@/lib/legal';
import { ConsentView } from '@/components/ConsentView';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Consent · Construction Ledger' };

/**
 * DPDP consent gate. Anyone signed in whose newest consent is not for the current policy version
 * is sent here by the app shell before they can reach project data. If consent is already current
 * there is nothing to do, so the user is forwarded to where they were heading.
 */
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = safeNextPath(next);

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/consent?next=${target}`)}`);

  const consent = await getActiveConsent(user.id);
  if (consent) redirect(target);

  return <ConsentView next={target} policyVersion={POLICY_VERSION} purposes={CONSENT_PURPOSES} />;
}
