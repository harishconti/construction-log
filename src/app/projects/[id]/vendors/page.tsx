import { notFound, redirect } from 'next/navigation';
import { VendorsView } from '@/components/VendorsView';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { asJson, listVendors } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function VendorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [membership, vendors] = await Promise.all([
    prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: id, userId: user.id } },
      select: { role: true },
    }),
    listVendors(id),
  ]);
  if (!membership) notFound();

  return <VendorsView projectId={id} role={membership.role} initial={asJson({ vendors })} />;
}
