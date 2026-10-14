import { notFound } from 'next/navigation';
import { BudgetsView } from '@/components/BudgetsView';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function BudgetsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: id, userId: user.id } },
    select: { role: true },
  });
  if (!membership) notFound();

  return <BudgetsView projectId={id} canEdit={membership.role === 'admin'} />;
}
