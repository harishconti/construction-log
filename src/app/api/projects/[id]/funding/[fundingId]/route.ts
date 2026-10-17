import { ApiError, handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';
import { updateFundingSchema } from '@/lib/validation/schemas';

type Ctx = { params: Promise<{ id: string; fundingId: string }> };

export const PATCH = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const { id: projectId, fundingId } = await paramsPromise;
  const user = await requireUser();
  await requireRole(projectId, user.id, 'editor'); // editors may edit ANY funding entry
  const body = await parseJson(req, updateFundingSchema);

  const before = await prisma.funding.findUnique({ where: { id: fundingId } });
  if (!before || before.projectId !== projectId) throw ApiError.notFound('Funding entry not found');
  if (before.deletedAt) throw ApiError.badRequest('Funding entry is deleted', 'FUNDING_DELETED');

  if (body.version !== undefined && body.version !== before.version) {
    throw new ApiError(409, 'VERSION_CONFLICT', 'Funding entry was modified by someone else');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.funding.updateMany({
      where: { id: fundingId, version: before.version },
      data: {
        ...(body.source !== undefined ? { source: body.source } : {}),
        ...(body.sourceName !== undefined ? { sourceName: body.sourceName } : {}),
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        ...(body.receivedAt !== undefined ? { receivedAt: body.receivedAt } : {}),
        ...(body.mode !== undefined ? { mode: body.mode } : {}),
        ...(body.reference !== undefined ? { reference: body.reference } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        version: { increment: 1 },
      },
    });
    if (res.count === 0) {
      throw new ApiError(409, 'VERSION_CONFLICT', 'Funding entry was modified by someone else');
    }
    const after = await tx.funding.findUnique({ where: { id: fundingId } });
    await writeAudit(tx, {
      entity: 'funding',
      entityId: fundingId,
      action: 'update',
      actorId: user.id,
      before: { ...before, amount: before.amount.toString() },
      after: after ? { ...after, amount: after.amount.toString() } : null,
    });
    return after;
  });

  return json({ funding: updated ? { ...updated, amount: updated.amount.toString() } : null });
});

export const DELETE = handle<Ctx>(async (_req, { params: paramsPromise }) => {
  const { id: projectId, fundingId } = await paramsPromise;
  const user = await requireUser();
  await requireRole(projectId, user.id, 'admin');

  const before = await prisma.funding.findUnique({ where: { id: fundingId } });
  if (!before || before.projectId !== projectId) throw ApiError.notFound('Funding entry not found');
  if (before.deletedAt) return json({ ok: true });

  await prisma.$transaction(async (tx) => {
    await tx.funding.update({
      where: { id: fundingId },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    await writeAudit(tx, {
      entity: 'funding',
      entityId: fundingId,
      action: 'delete',
      actorId: user.id,
      before: { ...before, amount: before.amount.toString() },
    });
  });

  return json({ ok: true });
});
