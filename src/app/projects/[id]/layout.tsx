import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '', label: 'Dashboard' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/diary', label: 'Diary' },
  { href: '/budgets', label: 'Budgets' },
];

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
  const nav =
    membership.role === 'admin'
      ? [...NAV, { href: '/members', label: 'Members' }, { href: '/settings', label: 'Settings' }]
      : NAV;

  return (
    <div className="min-h-screen sm:flex">
      <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white p-4 sm:block">
        <Link href="/projects" className="text-sm text-slate-500 hover:text-slate-900">
          ← All projects
        </Link>
        <h2 className="mt-3 text-base font-semibold">{membership.project.name}</h2>
        <nav className="mt-4 space-y-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={`${base}${item.href}`}
              className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex-1 pb-16 sm:pb-0">
        <div className="border-b border-slate-200 bg-white p-4 sm:hidden">
          <Link href="/projects" className="text-sm text-slate-500">
            ← Projects
          </Link>
          <h2 className="text-base font-semibold">{membership.project.name}</h2>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 flex border-t border-slate-200 bg-white sm:hidden">
        {nav.slice(0, 4).map((item) => (
          <Link
            key={item.href}
            href={`${base}${item.href}`}
            className="flex-1 py-3 text-center text-xs text-slate-600"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
