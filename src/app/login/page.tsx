'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Field, TextInput } from '@/components/ui/inputs';

type Mode = 'sign-in' | 'sign-up';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [magicPending, setMagicPending] = useState(false);
  const [socialPending, setSocialPending] = useState(false);

  async function signInWithGoogle() {
    setError(null);
    setNotice(null);
    setSocialPending(true);
    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: `${window.location.origin}/projects`,
      });
      const url = (result as { data?: { url?: string } })?.data?.url;
      if (result?.error) setError(result.error.message ?? 'Google sign-in failed');
      else if (url) window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setSocialPending(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      const result =
        mode === 'sign-up'
          ? await authClient.signUp.email({ email, password, name })
          : await authClient.signIn.email({ email, password });
      if (result?.error) {
        setError(result.error.message ?? 'Authentication failed');
        return;
      }
      router.push('/projects');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setPending(false);
    }
  }

  async function sendMagicLink() {
    setError(null);
    setNotice(null);
    if (!email) {
      setError('Enter your email first, then request a sign-in link.');
      return;
    }
    setMagicPending(true);
    try {
      const result = await authClient.signIn.magicLink({
        email,
        callbackURL: `${window.location.origin}/projects`,
      });
      if (result?.error) setError(result.error.message ?? 'Could not send sign-in link');
      else setNotice('Sign-in link sent — check your email.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send sign-in link');
    } finally {
      setMagicPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <div className="w-full max-w-[400px] rounded-lg border border-border bg-surface p-6 shadow-e1">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="mx-auto h-10 w-10" />
          <h1 className="mt-2 font-display text-2xl font-bold">Construction Ledger</h1>
        </div>

        <div role="tablist" aria-label="Authentication" className="mt-5 flex rounded-md bg-surface-2 p-1 text-sm">
          {(['sign-in', 'sign-up'] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`h-9 flex-1 rounded ${mode === m ? 'bg-surface font-semibold text-ink shadow-e1' : 'text-ink-2'}`}
            >
              {m === 'sign-in' ? 'Sign in' : 'Sign up'}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <Button variant="secondary" className="w-full" loading={socialPending} onClick={signInWithGoogle}>
            {mode === 'sign-up' ? 'Sign up with Google' : 'Sign in with Google'}
          </Button>
        </div>

        <div className="my-4 flex items-center gap-3 text-xs text-ink-3">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'sign-up' && (
            <Field label="Name">
              <TextInput
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          )}
          <Field label="Email">
            <TextInput
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password">
            <TextInput
              type="password"
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {error && <Alert message={error} />}
          {notice && (
            <p role="status" className="rounded-md bg-ok-tint px-3 py-2 text-sm text-ok">
              {notice}
            </p>
          )}

          <Button type="submit" className="w-full" loading={pending}>
            {mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        {mode === 'sign-in' && (
          <button
            type="button"
            onClick={sendMagicLink}
            disabled={magicPending}
            className="mt-4 w-full text-center text-sm text-primary hover:underline disabled:opacity-60"
          >
            {magicPending ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        )}
      </div>
    </main>
  );
}
