'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleAlert, LogIn, Mail, UserPlus } from 'lucide-react';
import { api } from '@/lib/api-client';
import { authClient } from '@/lib/auth/client';
import { authCompletePath } from '@/lib/safe-next';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { GoogleIcon } from '@/components/icons/GoogleIcon';

export type InviteState = 'invalid' | 'used' | 'revoked' | 'expired' | 'member' | 'signed-out' | 'ready';

const ROLE_LABEL: Record<string, string> = { admin: 'an admin', editor: 'an editor', viewer: 'a viewer' };

const DEAD: Record<string, { title: string; body: string }> = {
  invalid: { title: 'This invite link isn’t valid', body: 'Check that you opened the whole link, or ask the project admin for a new one.' },
  used: { title: 'This invite link was already used', body: 'Each link works once. Ask the project admin for a new link.' },
  revoked: { title: 'This invite link was cancelled', body: 'Ask the project admin for a new link.' },
  expired: { title: 'This invite link has expired', body: 'Links last 7 days. Ask the project admin for a new one.' },
};

export function InviteJoin({
  token,
  state,
  projectId,
  projectName,
  role,
  userEmail,
  autoJoin,
}: {
  token: string;
  state: InviteState;
  projectId: string | null;
  projectName: string | null;
  role: string | null;
  userEmail: string | null;
  autoJoin: boolean;
}) {
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoTried = useRef(false);

  // After signing in we come back here with ?join=1 — finish the job without another tap.
  const returnPath = `/invite/${token}?join=1`;

  async function join() {
    setError(null);
    setJoining(true);
    try {
      const res = await api.post<{ projectId: string }>(`/api/invite-links/${token}/accept`);
      router.replace(`/projects/${res.projectId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join the project');
      setJoining(false);
    }
  }

  useEffect(() => {
    if (state === 'ready' && autoJoin && !autoTried.current) {
      autoTried.current = true;
      void join();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, autoJoin]);

  async function continueWithGoogle() {
    setError(null);
    setGooglePending(true);
    try {
      const complete = `${window.location.origin}${authCompletePath(returnPath)}`;
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: complete,
        newUserCallbackURL: complete,
        errorCallbackURL: `${window.location.origin}/login?oauth_error=1&next=${encodeURIComponent(returnPath)}`,
      });
      const url = (result as { data?: { url?: string } })?.data?.url;
      if (result?.error) setError(result.error.message ?? 'Google sign-in failed');
      else if (url) window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setGooglePending(false);
    }
  }

  const dead = DEAD[state];

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <div className="w-full max-w-[400px] rounded-lg border border-border bg-surface p-6 shadow-e1">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="mx-auto h-10 w-10" />
          {dead ? (
            <>
              <CircleAlert size={28} aria-hidden className="mx-auto mt-4 text-danger" />
              <h1 className="mt-2 font-display text-xl font-bold">{dead.title}</h1>
              <p className="mt-2 text-sm text-ink-2">{dead.body}</p>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm text-ink-3">You’re invited to join</p>
              <h1 className="mt-1 break-words font-display text-2xl font-bold">{projectName}</h1>
              {role && <p className="mt-1 text-sm text-ink-2">as {ROLE_LABEL[role] ?? role}</p>}
            </>
          )}
        </div>

        <div className="mt-6 space-y-3">
          {error && <Alert message={error} />}

          {state === 'signed-out' && (
            <>
              <Button variant="secondary" className="w-full" loading={googlePending} onClick={continueWithGoogle}>
                {!googlePending && <GoogleIcon />} Continue with Google
              </Button>
              <Link
                href={`/login?next=${encodeURIComponent(returnPath)}`}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border-strong bg-surface text-sm font-medium text-ink hover:bg-surface-2"
              >
                <Mail size={16} aria-hidden /> Continue with email
              </Link>
              <p className="text-center text-xs text-ink-3">New here? Either option creates your account.</p>
            </>
          )}

          {state === 'ready' && (
            <>
              <Button className="w-full" size="lg" loading={joining} onClick={join}>
                {!joining && <UserPlus size={18} aria-hidden />} Join project
              </Button>
              <p className="text-center text-xs text-ink-3">Signed in as {userEmail}</p>
            </>
          )}

          {state === 'member' && projectId && (
            <>
              <p className="text-center text-sm text-ink-2">You’re already a member of this project.</p>
              <Link
                href={`/projects/${projectId}`}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary-hover"
              >
                Open project
              </Link>
            </>
          )}

          {dead && (
            <Link
              href={userEmail ? '/projects' : '/login'}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border-strong bg-surface text-sm font-medium text-ink hover:bg-surface-2"
            >
              {userEmail ? 'Go to your projects' : (<><LogIn size={16} aria-hidden /> Sign in</>)}
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
