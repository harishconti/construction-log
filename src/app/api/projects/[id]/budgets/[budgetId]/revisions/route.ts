import { ApiError, handle, json } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';

type Ctx = { params: Promise<{ id: string; budgetId: string }> };

export const GET = handle<Ctx>(async (_req, { params: paramsPromise }) => {
  const { id: projectId, budgetId } = await paramsPromise;
  const user = await requireUser();
  await requireRole(projectId, user.id, 'viewer');

  const budget = await prisma.budget.findUnique({ where: { id: budgetId }, select: { projectId: true } });
  if (!budget || budget.projectId !== projectId) throw ApiError.notFound('Budget not found');

  const revisions = await prisma.budgetRevision.findMany({
    where: { budgetId },
    orderBy: { changedAt: 'desc' },
  });

  return json({
    revisions: revisions.map((r) => ({
      id: r.id,
      oldAmount: r.oldAmount.toString(),
      newAmount: r.newAmount.toString(),
      reason: r.reason,
      changedBy: r.changedBy,
      changedAt: r.changedAt,
    })),
  });
});
