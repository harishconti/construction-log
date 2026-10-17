'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  CalendarDays,
  LayoutDashboard,
  MoreHorizontal,
  PiggyBank,
  Receipt,
  Settings as SettingsIcon,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  transactions: Receipt,
  funding: PiggyBank,
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
        }`}
      >
        <PillContent Icon={Icon} label={label} active={active} />
      </Link>
    );
  }

  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className="block">
      <RowContent Icon={Icon} label={label} active={active} />
    </Link>
  );
}

// Inside <Link> so useLinkStatus can show the tapped tab as selected while its navigation is
// pending: the tap is acknowledged at once, even before the next screen arrives.
function PillContent({ Icon, label, active }: { Icon: LucideIcon; label: string; active: boolean }) {
  const { pending } = useLinkStatus();
  const on = active || pending;
  return (
    <>
      <span
        className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${on ? 'bg-primary-tint text-primary' : 'text-ink-2'}`}
      >
        <Icon size={22} strokeWidth={2} aria-hidden />
      </span>
      <span className={`max-w-full truncate px-1 ${on ? 'font-semibold text-primary' : 'text-ink-2'}`}>{label}</span>
    </>
  );
}

function RowContent({ Icon, label, active }: { Icon: LucideIcon; label: string; active: boolean }) {
  const { pending } = useLinkStatus();
  const on = active || pending;
  return (
    <span
      className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm ${
        on ? 'bg-primary-tint font-semibold text-primary' : 'text-ink-2 hover:bg-surface-2'
      }`}
    >
      <Icon size={20} strokeWidth={2} aria-hidden />
      <span>{label}</span>
    </span>
  );
}
