import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { NavLink, type NavIcon } from '@/components/NavLink';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';

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

  const [membership, allMemberships] = await Promise.all([
    prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: id, userId: user.id } },
      select: { role: true, project: { select: { name: true } } },
    }),
    prisma.projectMember.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      select: { project: { select: { id: true, name: true } } },
    }),
  ]);
  if (!membership) redirect('/projects');

  const current = { id, name: membership.project.name };
  const projects = allMemberships.map((m) => m.project);

  const base = `/projects/${id}`;
  const nav: Item[] =
    membership.role === 'admin'
      ? [...NAV, { href: '/members', label: 'Members', icon: 'members' }, { href: '/settings', label: 'Settings', icon: 'settings' }]
      : NAV;

  const mobileNav = nav.filter((item) => MOBILE_TABS.includes(item.href));
  const hasMore = nav.some((item) => !MOBILE_TABS.includes(item.href));

  return (
    <div className="min-h-dvh md:flex">
      {/* md: 72 px icon rail */}
      <aside className="sticky top-0 hidden h-dvh w-[72px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border bg-surface px-1 py-3 md:flex lg:hidden">
        <Link
          href="/projects"
          aria-label="All projects"
          title="All projects"
          className="mb-2 flex h-11 w-11 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2"
        >
          <ArrowLeft size={20} aria-hidden />
        </Link>
        <nav aria-label="Project" className="flex w-full flex-col gap-1">
          {nav.map((item) => (
            <NavLink
              key={item.href}
              href={`${base}${item.href}`}
              label={item.label}
              icon={item.icon}
              exact={item.href === ''}
              variant="rail"
            />
          ))}
        </nav>
      </aside>

      {/* lg: 248 px sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col overflow-y-auto border-r border-border bg-surface p-4 lg:flex">
        <Link href="/projects" className="flex min-h-11 items-center gap-2 text-sm text-ink-3 hover:text-ink">
          <ArrowLeft size={16} aria-hidden /> All projects
        </Link>
        <ProjectSwitcher current={current} projects={projects} className="-mx-2 mt-1" />
        <nav aria-label="Project" className="mt-4 space-y-1">
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

      <div className="min-w-0 flex-1 pb-[var(--bottom-nav-h)] md:pb-0">
        {/* Mobile: sticky top bar with back + project switcher */}
        <header
          className="sticky top-0 z-30 flex h-16 items-center gap-1 border-b border-border bg-surface px-2 md:hidden"
          style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(4rem + env(safe-area-inset-top))' }}
        >
          <Link
            href="/projects"
            aria-label="All projects"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2"
          >
            <ArrowLeft size={20} aria-hidden />
          </Link>
          <ProjectSwitcher current={current} projects={projects} />
        </header>
        <main className="mx-auto max-w-[1200px] p-4 md:p-6 lg:p-8">{children}</main>
      </div>

      <nav
        aria-label="Project"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {mobileNav.map((item) => (
          <NavLink
            key={item.href}
            href={`${base}${item.href}`}
            label={item.label}
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
