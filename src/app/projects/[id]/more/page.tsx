import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { MoreMenu, type MoreItem } from '@/components/MoreMenu';

export const dynamic = 'force-dynamic';

const ITEMS: MoreItem[] = [
  { href: '', label: 'Dashboard', desc: 'Spend, budgets and recent activity', icon: 'dashboard' },
  { href: '/transactions', label: 'Expenses', desc: 'All expenses and payments', icon: 'transactions' },
  { href: '/funding', label: 'Funding', desc: 'Money in: loans, clients, grants', icon: 'funding' },
  { href: '/timeline', label: 'Timeline', desc: 'Expenses and diary together', icon: 'timeline' },
  { href: '/diary', label: 'Diary', desc: 'Site observations and photos', icon: 'diary' },
  { href: '/budgets', label: 'Budgets', desc: 'Planned vs actual by week/month', icon: 'budgets' },
];

const ADMIN_ITEMS: MoreItem[] = [
  { href: '/members', label: 'Members', desc: 'Invite people and set roles', icon: 'members' },
  { href: '/settings', label: 'Settings', desc: 'Project details and categories', icon: 'settings' },
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

  const base = `/projects/${id}`;
  const items = (membership.role === 'admin' ? [...ITEMS, ...ADMIN_ITEMS] : ITEMS).map((item) => ({
    ...item,
    href: `${base}${item.href}`,
  }));

  return <MoreMenu items={items} />;
}
