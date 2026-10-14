'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';

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
      if (result?.error) {
        setError(result.error.message ?? 'Google sign-in failed');
      } else if (url) {
        window.location.href = url;
      }
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
      setError('Enter your email first, then request a magic link.');
      return;
    }
    setMagicPending(true);
    try {
      const result = await authClient.signIn.magicLink({
        email,
        callbackURL: `${window.location.origin}/projects`,
      });
      if (result?.error) {
        setError(result.error.message ?? 'Could not send magic link');
        return;
      }
      setNotice('Magic link sent — check your email.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send magic link');
    } finally {
      setMagicPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Construction Ledger</h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === 'sign-in' ? 'Sign in to continue' : 'Create your account'}
        </p>

        <div className="mt-4 flex gap-2 rounded-lg bg-slate-100 p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode('sign-in')}
            className={`flex-1 rounded-md py-1.5 ${mode === 'sign-in' ? 'bg-white shadow-sm' : 'text-slate-500'}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode('sign-up')}
            className={`flex-1 rounded-md py-1.5 ${mode === 'sign-up' ? 'bg-white shadow-sm' : 'text-slate-500'}`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {mode === 'sign-up' && (
            <div>
              <label className="block text-sm font-medium text-slate-700">Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {notice && <p className="text-sm text-green-700">{notice}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={socialPending}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H24v7.1h11.3C33.7 32.9 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5-5C33.5 6.9 29 5 24 5 13 5 4 14 4 25s9 20 20 20c11 0 19-8 19-20 0-1.5-.2-3-.4-4.5z" />
              <path fill="#FF3D00" d="M6.3 15.3l5.8 4.3C13.7 16 18.5 13 24 13c3.1 0 5.9 1.2 8 3.1l5-5C33.5 6.9 29 5 24 5 16.3 5 9.7 9.3 6.3 15.3z" />
              <path fill="#4CAF50" d="M24 45c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 36 26.8 36 24 36c-5.3 0-9.7-3.4-11.3-8.1l-6.2 4.8C9.7 40.5 16.3 45 24 45z" />
              <path fill="#1976D2" d="M43.6 20.5H24v7.1h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C41.2 34.9 44 30.4 44 25c0-1.5-.2-3-.4-4.5z" />
            </svg>
            {socialPending
              ? mode === 'sign-up'
                ? 'Creating account…'
                : 'Signing in…'
              : mode === 'sign-up'
                ? 'Sign up with Google'
                : 'Sign in with Google'}
          </button>
        </div>

        {mode === 'sign-in' && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={sendMagicLink}
              disabled={magicPending}
              className="w-full rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {magicPending ? 'Sending…' : 'Email me a magic link'}
            </button>
            <p className="mt-2 text-center text-xs text-slate-400">
              Passwordless sign-in. Requires magic link to be enabled for this project.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
