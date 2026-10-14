'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
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
      className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-ink-2 hover:bg-surface-2"
    >
      <LogOut size={16} aria-hidden /> Sign out
    </button>
  );
}
