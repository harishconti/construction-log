import { notFound, redirect } from 'next/navigation';
import { MembersView } from '@/components/MembersView';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function MembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: id, userId: user.id } },
    select: { role: true },
  });
  if (!membership) notFound();
  if (membership.role !== 'admin') redirect(`/projects/${id}`);

  return <MembersView projectId={id} currentUserId={user.id} />;
}
