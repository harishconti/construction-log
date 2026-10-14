import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const ITEMS = [
  { href: '', label: 'Dashboard', desc: 'Spend, budgets and recent activity' },
  { href: '/transactions', label: 'Transactions', desc: 'All expenses and payments' },
  { href: '/timeline', label: 'Timeline', desc: 'Transactions and diary together' },
  { href: '/diary', label: 'Diary', desc: 'Site observations and photos' },
  { href: '/budgets', label: 'Budgets', desc: 'Planned vs actual by week/month' },
];

const ADMIN_ITEMS = [
  { href: '/members', label: 'Members', desc: 'Invite people and set roles' },
  { href: '/settings', label: 'Settings', desc: 'Project details and categories' },
];

export default async function MorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: id, userId: user.id } },
    select: { role: true },
  });
  if (!membership) notFound();

  const items = membership.role === 'admin' ? [...ITEMS, ...ADMIN_ITEMS] : ITEMS;
  const base = `/projects/${id}`;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">More</h1>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={`${base}${item.href}`} className="block p-4 hover:bg-slate-50">
              <div className="font-medium">{item.label}</div>
              <div className="text-sm text-slate-500">{item.desc}</div>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/projects" className="inline-block text-sm text-slate-500 hover:text-slate-900">
        ← All projects
      </Link>
    </div>
  );
}
