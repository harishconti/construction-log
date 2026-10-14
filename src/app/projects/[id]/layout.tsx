import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { NavLink, type NavIcon } from '@/components/NavLink';

export const dynamic = 'force-dynamic';

type Item = { href: string; label: string; icon: NavIcon };

const NAV: Item[] = [
  { href: '', label: 'Dashboard', icon: 'dashboard' },
  { href: '/transactions', label: 'Expenses', icon: 'transactions' },
  { href: '/timeline', label: 'Timeline', icon: 'timeline' },
  { href: '/diary', label: 'Diary', icon: 'diary' },
  { href: '/budgets', label: 'Budgets', icon: 'budgets' },
];

const MOBILE_TABS = ['', '/transactions', '/diary'];

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: id, userId: user.id } },
    select: { role: true, project: { select: { name: true } } },
  });
  if (!membership) redirect('/projects');

  const base = `/projects/${id}`;
  const nav: Item[] =
    membership.role === 'admin'
      ? [...NAV, { href: '/members', label: 'Members', icon: 'members' }, { href: '/settings', label: 'Settings', icon: 'settings' }]
      : NAV;

  const mobileNav = nav.filter((item) => MOBILE_TABS.includes(item.href));
  const hasMore = nav.some((item) => !MOBILE_TABS.includes(item.href));

  return (
    <div className="min-h-dvh sm:flex">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface p-4 sm:block">
        <Link href="/projects" className="text-sm text-ink-3 hover:text-ink">
          ← All projects
        </Link>
        <h2 className="mt-3 truncate font-display text-base font-semibold">{membership.project.name}</h2>
        <nav className="mt-4 space-y-1">
          {nav.map((item) => (
            <NavLink
              key={item.href}
              href={`${base}${item.href}`}
              label={item.label}
              icon={item.icon}
              exact={item.href === ''}
            />
          ))}
        </nav>
      </aside>

      <div className="flex-1 pb-20 sm:pb-0" style={{ paddingBottom: 'var(--bottom-nav-h)' }}>
        <div className="border-b border-border bg-surface p-4 sm:hidden">
          <Link href="/projects" className="text-sm text-ink-3">
            ← Projects
          </Link>
          <h2 className="truncate font-display text-base font-semibold">{membership.project.name}</h2>
        </div>
        <div className="mx-auto max-w-[1200px] p-4 sm:p-6">{children}</div>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface sm:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {mobileNav.map((item) => (
          <NavLink
            key={item.href}
            href={`${base}${item.href}`}
            label={item.label === 'Expenses' ? 'Expenses' : item.label}
            icon={item.icon}
            exact={item.href === ''}
            variant="bottom"
          />
        ))}
        {hasMore && <NavLink href={`${base}/more`} label="More" icon="more" variant="bottom" />}
      </nav>
    </div>
  );
}
