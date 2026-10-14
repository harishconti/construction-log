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
      className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
    >
      Sign out
    </button>
  );
}
