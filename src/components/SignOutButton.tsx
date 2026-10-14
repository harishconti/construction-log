'use client';

import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={async () => {
        await authClient.signOut();
        router.push('/login');
        router.refresh();
      }}
      className="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-ink-2 hover:bg-surface-2"
    >
      Sign out
    </button>
  );
}
