'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Receipt,
  Settings as SettingsIcon,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { authClient } from '@/lib/auth/client';

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  transactions: Receipt,
  timeline: CalendarDays,
  diary: BookOpen,
  budgets: Wallet,
  members: Users,
  settings: SettingsIcon,
};

export type MoreItem = { href: string; label: string; desc: string; icon: string };

export function MoreMenu({ items }: { items: MoreItem[] }) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">More</h1>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {items.map((item) => {
          const Icon = ICONS[item.icon] ?? ChevronRight;
          return (
            <li key={item.href}>
              <Link href={item.href} className="flex min-h-14 items-center gap-3 p-4 hover:bg-surface-2">
                <Icon size={20} aria-hidden className="text-ink-3" />
                <span className="flex-1">
                  <span className="block font-medium">{item.label}</span>
                  <span className="block text-sm text-ink-3">{item.desc}</span>
                </span>
                <ChevronRight size={18} aria-hidden className="text-ink-3" />
              </Link>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={async () => {
          await authClient.signOut();
          router.push('/login');
          router.refresh();
        }}
        className="flex min-h-14 w-full items-center gap-3 rounded-lg border border-border bg-surface p-4 text-left hover:bg-surface-2"
      >
        <LogOut size={20} aria-hidden className="text-danger" />
        <span className="font-medium text-danger">Sign out</span>
      </button>
    </div>
  );
}
