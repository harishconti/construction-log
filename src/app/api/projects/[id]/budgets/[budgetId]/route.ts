import { ApiError, handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';
import { updateBudgetSchema } from '@/lib/validation/schemas';

type Ctx = { params: Promise<{ id: string; budgetId: string }> };

export const PATCH = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const { id: projectId, budgetId } = await paramsPromise;
  const user = await requireUser();
  await requireRole(projectId, user.id, 'admin');
  const body = await parseJson(req, updateBudgetSchema);

  const before = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!before || before.projectId !== projectId) throw ApiError.notFound('Budget not found');

  if (body.version !== undefined && body.version !== before.version) {
    throw new ApiError(409, 'VERSION_CONFLICT', 'Budget was modified by someone else');
  }

  const budget = await prisma.$transaction(async (tx) => {
    const res = await tx.budget.updateMany({
      where: { id: budgetId, version: before.version },
      data: { plannedAmount: body.plannedAmount, version: { increment: 1 } },
    });
    if (res.count === 0) {
      throw new ApiError(409, 'VERSION_CONFLICT', 'Budget was modified by someone else');
    }
    if (Number(before.plannedAmount) !== body.plannedAmount) {
      await tx.budgetRevision.create({
        data: {
          budgetId,
          oldAmount: before.plannedAmount,
          newAmount: body.plannedAmount,
          reason: body.reason ?? null,
          changedBy: user.id,
        },
      });
    }
    const after = await tx.budget.findUnique({ where: { id: budgetId } });
    await writeAudit(tx, { entity: 'budget', entityId: budgetId, action: 'update', actorId: user.id, before, after });
    return after;
  });

  return json({ budget });
});
