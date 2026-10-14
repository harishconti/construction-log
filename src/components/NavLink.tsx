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
  variant?: 'sidebar' | 'rail' | 'bottom';
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const Icon = ICONS[icon];

  if (variant === 'bottom' || variant === 'rail') {
    // Icon in an active pill above a 12 px label (Material-style), used by the bottom bar and md rail.
    return (
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`flex flex-col items-center justify-center gap-1 text-xs ${
          variant === 'bottom' ? 'min-h-[56px] flex-1' : 'min-h-[60px] w-full rounded-md hover:bg-surface-2'
        } ${active ? 'font-semibold text-primary' : 'text-ink-2'}`}
      >
        <span
          className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
            active ? 'bg-primary-tint' : ''
          }`}
        >
          <Icon size={22} strokeWidth={2} aria-hidden />
        </span>
        <span className="max-w-full truncate px-1">{label}</span>
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
