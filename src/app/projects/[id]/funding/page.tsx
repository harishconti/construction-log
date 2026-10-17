import { notFound, redirect } from 'next/navigation';
import { FundingView } from '@/components/FundingView';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { asJson, listFundings } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function FundingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // The first screen of data comes with the page (one round trip), fetched alongside the membership
  // check; nothing is rendered unless the user is a member.
  const [membership, list] = await Promise.all([
    prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: id, userId: user.id } },
      select: { role: true },
    }),
    listFundings(id),
  ]);
  if (!membership) notFound();

  return <FundingView projectId={id} role={membership.role} initial={asJson(list)} />;
}
