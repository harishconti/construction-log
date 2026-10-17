import { notFound, redirect } from 'next/navigation';
import { TransactionsView } from '@/components/TransactionsView';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { asJson, listCategories, listStages, listTransactions, listVendors } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // The first screen of data comes with the page (one round trip), fetched alongside the membership
  // check; nothing is rendered unless the user is a member.
  const [membership, list, categories, vendors, stages] = await Promise.all([
    prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: id, userId: user.id } },
      select: { role: true },
    }),
    listTransactions(id),
    listCategories(id),
    listVendors(id),
    listStages(id),
  ]);
  if (!membership) notFound();

  return (
    <TransactionsView
      projectId={id}
      role={membership.role}
      initial={asJson({
        ...list,
        categories,
        vendorNames: vendors.map((v) => v.name),
        stages: stages.map((s) => ({ id: s.id, name: s.name })),
      })}
    />
  );
}
