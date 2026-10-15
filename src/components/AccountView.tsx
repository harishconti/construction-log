'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { SignOutButton } from '@/components/SignOutButton';
import { formatDate } from '@/lib/format';
import { isConsentPurposeKey, type ConsentPurpose, type ConsentPurposeKey } from '@/lib/legal';

export type AccountConsent = { policyVersion: string; grantedAt: string; purposes: string[] } | null;
export type AccountDeletion = {
  status: string;
  requestedAt: string;
  scheduledFor: string;
  completedAt: string | null;
} | null;

const STATUS_TEXT: Record<string, string> = {
  pending: 'Scheduled',
  cancelled: 'Cancelled',
  completed: 'Completed',
};

export function AccountView({
  user,
  consent,
  deletion,
  purposes,
  policyVersion,
  graceDays,
}: {
  user: { id: string; name: string; email: string };
  consent: AccountConsent;
  deletion: AccountDeletion;
  purposes: ConsentPurpose[];
  policyVersion: string;
  graceDays: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const required = purposes.filter((p) => p.required);
  const optional = purposes.filter((p) => !p.required);

  const grantedOptional = (consent?.purposes ?? []).filter(
    (k): k is ConsentPurposeKey => isConsentPurposeKey(k) && optional.some((o) => o.key === k),
  );
  const [optionalKeys, setOptionalKeys] = useState<ConsentPurposeKey[]>(grantedOptional);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingDeletion = deletion?.status === 'pending';

  function toggle(key: ConsentPurposeKey) {
    setOptionalKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function savePreferences() {
    if (!consent) return;
    setSaving(true);
    setError(null);
    try {
      await api.post('/api/consent', {
        policyVersion,
        purposes: [...required.map((p) => p.key), ...optionalKeys],
        granted: true,
      });
      toast.notify('Preferences saved');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your preferences');
    } finally {
      setSaving(false);
    }
  }

  async function requestDeletion() {
    setConfirmOpen(false);
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/account/deletion', { confirm: true });
      toast.notify('Account deletion scheduled');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not schedule deletion');
    } finally {
      setBusy(false);
    }
  }

  async function cancelDeletion() {
    setBusy(true);
    setError(null);
    try {
      await api.delete('/api/account/deletion');
      toast.notify('Deletion cancelled — your account is safe');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel deletion');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-[720px] p-4 sm:p-6">
      <Link
        href="/projects"
        className="inline-flex min-h-11 items-center gap-2 text-sm text-ink-3 hover:text-ink"
      >
        <ArrowLeft size={16} aria-hidden /> All projects
      </Link>

      <header className="mt-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold">Account &amp; data</h1>
          <p className="truncate text-sm text-ink-3">{user.email}</p>
        </div>
        <SignOutButton />
      </header>

      {error && <div className="mt-4"><Alert message={error} /></div>}

      <section className="mt-4 rounded-lg border border-border bg-surface p-4">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <ShieldCheck size={18} aria-hidden className="text-ok" /> Consent
        </h2>
        {!consent ? (
          <div className="mt-3">
            <Alert
              variant="info"
              message="You have not accepted the current Terms and Privacy Policy yet."
            />
            <Button className="mt-3" onClick={() => router.push('/consent?next=%2Faccount')}>
              Review and accept
            </Button>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-2">
              Accepted version {consent.policyVersion} on {formatDate(consent.grantedAt)}. You can
              withdraw consent by deleting your account (below). Read the{' '}
              <Link href="/terms" className="text-primary underline">
                Terms
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-primary underline">
                Privacy Policy
              </Link>
              .
            </p>

            <ul className="mt-3 space-y-2">
              {required.map((p) => (
                <li key={p.key} className="flex items-start gap-2 text-sm text-ink-2">
                  <span aria-hidden className="mt-0.5 text-ok">✓</span>
                  <span>
                    <span className="font-medium text-ink">{p.title}</span> · Required — cannot be
                    switched off while the account exists.
                  </span>
                </li>
              ))}
              {optional.map((p) => (
                <li key={p.key}>
                  <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 shrink-0 accent-[var(--primary)]"
                      checked={optionalKeys.includes(p.key)}
                      onChange={() => toggle(p.key)}
                    />
                    <span className="text-ink-2">
                      <span className="font-medium text-ink">{p.title}</span> · Optional
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            <Button variant="secondary" className="mt-2" loading={saving} onClick={savePreferences}>
              Save preferences
            </Button>
          </>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-danger bg-surface p-4">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-danger">
          <Trash2 size={18} aria-hidden /> Delete account &amp; data
        </h2>

        {pendingDeletion ? (
          <div className="mt-2 space-y-3 text-sm text-ink-2">
            <p>
              Your account is scheduled for deletion on{' '}
              <strong className="text-ink">{formatDate(deletion!.scheduledFor)}</strong> ({STATUS_TEXT.pending}
              ). You can keep using the app until then, or cancel below.
            </p>
            <p>
              When deletion runs, your name and email are erased and the projects you solely own —
              including their expenses, diary entries, budgets and photos — are permanently deleted.
              Projects shared with other members stay available to them.
            </p>
            <Button variant="secondary" loading={busy} onClick={cancelDeletion}>
              Cancel deletion
            </Button>
          </div>
        ) : (
          <div className="mt-2 space-y-3 text-sm text-ink-2">
            <p>
              Deleting your account withdraws your consent and erases your personal data after a{' '}
              {graceDays}-day grace period. During the grace period nothing is removed and you can
              cancel.
            </p>
            <p>
              Projects you solely own — including their expenses, diary entries, budgets and uploaded
              photos — are permanently deleted. Projects shared with other members stay available to
              them, without your personal details.
            </p>
            {deletion?.status === 'cancelled' && (
              <p className="text-ink-3">Your previous deletion request was cancelled.</p>
            )}
            <Button variant="danger" loading={busy} onClick={() => setConfirmOpen(true)}>
              <Trash2 size={16} aria-hidden /> Delete my account
            </Button>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete your account?"
        message={`Your account and the projects you solely own will be permanently deleted after a ${graceDays}-day grace period. You can cancel any time before then.`}
        confirmLabel="Schedule deletion"
        destructive
        onConfirm={requestDeletion}
        onCancel={() => setConfirmOpen(false)}
      />
    </main>
  );
}
