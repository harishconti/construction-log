import { notFound, redirect } from 'next/navigation';
import { DiaryView } from '@/components/DiaryView';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { asJson, listDiary } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function DiaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // First screen of entries comes with the page (one round trip); see transactions/page.tsx.
  const [membership, list] = await Promise.all([
    prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: id, userId: user.id } },
      select: { role: true },
    }),
    listDiary(id),
  ]);
  if (!membership) notFound();

  return <DiaryView projectId={id} currentUserId={user.id} role={membership.role} initial={asJson(list)} />;
}
