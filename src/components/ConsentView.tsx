'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import type { ConsentPurpose, ConsentPurposeKey } from '@/lib/legal';

/**
 * The DPDP consent notice. Required purposes are shown as necessary (a lock, not a toggle); the
 * optional purpose is a real choice. Consent is only sent when the user has actively affirmed that
 * they have read the Terms and Privacy Policy — the `granted: true` flag can never come from an
 * untouched form.
 */
export function ConsentView({
  next,
  policyVersion,
  purposes,
}: {
  next: string;
  policyVersion: string;
  purposes: ConsentPurpose[];
}) {
  const router = useRouter();
  const optional = purposes.filter((p) => !p.required);
  const [optionalKeys, setOptionalKeys] = useState<ConsentPurposeKey[]>(optional.map((p) => p.key));
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function toggle(key: ConsentPurposeKey) {
    setOptionalKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const required = purposes.filter((p) => p.required).map((p) => p.key);
      await api.post('/api/consent', {
        policyVersion,
        purposes: [...required, ...optionalKeys],
        granted: true,
      });
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record your consent');
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center p-4">
      <form onSubmit={submit} className="rounded-lg border border-border bg-surface p-5 shadow-e1">
        <h1 className="font-display text-2xl font-bold">Before you continue</h1>
        <p className="mt-2 text-sm text-ink-2">
          We need your consent to process your personal data. Under India’s DPDP Act you choose each
          purpose, and you can change your mind later. Read our{' '}
          <Link href="/terms" className="text-primary underline">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-primary underline">
            Privacy Policy
          </Link>
          .
        </p>

        <ul className="mt-4 space-y-2">
          {purposes.map((p) => (
            <li key={p.key} className="rounded-md border border-border p-3">
              {p.required ? (
                <div className="flex items-start gap-3">
                  <Lock size={16} aria-hidden className="mt-1 shrink-0 text-ink-3" />
                  <span>
                    <span className="block text-sm font-semibold">
                      {p.title} <span className="font-normal text-ink-3">· Required</span>
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-2">{p.description}</span>
                  </span>
                </div>
              ) : (
                <label className="flex min-h-11 cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0 accent-[var(--primary)]"
                    checked={optionalKeys.includes(p.key)}
                    onChange={() => toggle(p.key)}
                  />
                  <span>
                    <span className="block text-sm font-semibold">
                      {p.title} <span className="font-normal text-ink-3">· Optional</span>
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-2">{p.description}</span>
                  </span>
                </label>
              )}
            </li>
          ))}
        </ul>

        <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0 accent-[var(--primary)]"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            required
          />
          <span className="text-sm">
            I have read and agree to the Terms of Service and Privacy Policy, and I give the consents
            selected above.
          </span>
        </label>

        {error && <div className="mt-3"><Alert message={error} /></div>}

        <Button type="submit" className="mt-4 w-full" loading={pending} disabled={!agreed}>
          Agree and continue
        </Button>
        <p className="mt-2 text-center text-xs text-ink-3">
          You can withdraw consent or delete your account at any time from Account settings.
        </p>
      </form>
    </main>
  );
}
