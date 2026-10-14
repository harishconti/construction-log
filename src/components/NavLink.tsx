'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  CalendarDays,
  LayoutDashboard,
  MoreHorizontal,
  Receipt,
  Settings as SettingsIcon,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  transactions: Receipt,
  timeline: CalendarDays,
  diary: BookOpen,
  budgets: Wallet,
  members: Users,
  settings: SettingsIcon,
  more: MoreHorizontal,
};

export type NavIcon = keyof typeof ICONS;

export function NavLink({
  href,
  label,
  icon,
  exact = false,
  variant = 'sidebar',
}: {
  href: string;
  label: string;
  icon: NavIcon;
  exact?: boolean;
  variant?: 'sidebar' | 'bottom';
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const Icon = ICONS[icon];

  if (variant === 'bottom') {
    return (
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
          active ? 'font-semibold text-primary' : 'text-ink-2'
        }`}
      >
        <Icon size={22} strokeWidth={2} aria-hidden />
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm ${
        active ? 'bg-primary-tint font-semibold text-primary' : 'text-ink-2 hover:bg-surface-2'
      }`}
    >
      <Icon size={20} strokeWidth={2} aria-hidden />
      <span>{label}</span>
    </Link>
  );
}
