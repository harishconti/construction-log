import { notFound, redirect } from 'next/navigation';
import { StagesView } from '@/components/StagesView';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { asJson, listStages } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function StagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [membership, stages] = await Promise.all([
    prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: id, userId: user.id } },
      select: { role: true },
    }),
    listStages(id),
  ]);
  if (!membership) notFound();

  return <StagesView projectId={id} role={membership.role} initial={asJson({ stages })} />;
}
