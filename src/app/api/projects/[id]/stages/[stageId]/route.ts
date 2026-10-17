import { ApiError, handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';
import { updateStageSchema } from '@/lib/validation/schemas';

type Ctx = { params: Promise<{ id: string; stageId: string }> };

export const PATCH = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const { id: projectId, stageId } = await paramsPromise;
  const user = await requireUser();
  await requireRole(projectId, user.id, 'editor');
  const body = await parseJson(req, updateStageSchema);

  const before = await prisma.stage.findUnique({ where: { id: stageId } });
  if (!before || before.projectId !== projectId) throw ApiError.notFound('Stage not found');

  if (body.version !== undefined && body.version !== before.version) {
    throw new ApiError(409, 'VERSION_CONFLICT', 'Stage was modified by someone else');
  }

  if (body.name && body.name !== before.name) {
    const duplicate = await prisma.stage.findUnique({
      where: { projectId_name: { projectId, name: body.name } },
      select: { id: true },
    });
    if (duplicate) throw ApiError.conflict('A stage with this name already exists');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.stage.updateMany({
      where: { id: stageId, version: before.version },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.plannedAmount !== undefined ? { plannedAmount: body.plannedAmount } : {}),
        ...(body.plannedStart !== undefined ? { plannedStart: body.plannedStart } : {}),
        ...(body.plannedEnd !== undefined ? { plannedEnd: body.plannedEnd } : {}),
        ...(body.order !== undefined ? { order: body.order } : {}),
        version: { increment: 1 },
      },
    });
    if (res.count === 0) {
      throw new ApiError(409, 'VERSION_CONFLICT', 'Stage was modified by someone else');
    }
    const after = await tx.stage.findUnique({ where: { id: stageId } });
    await writeAudit(tx, {
      entity: 'stage',
      entityId: stageId,
      action: 'update',
      actorId: user.id,
      before: { ...before, plannedAmount: before.plannedAmount?.toString() ?? null },
      after: after ? { ...after, plannedAmount: after.plannedAmount?.toString() ?? null } : null,
    });
    return after;
  });

  return json({ stage: updated ? { ...updated, plannedAmount: updated.plannedAmount?.toString() ?? null } : null });
});

export const DELETE = handle<Ctx>(async (_req, { params: paramsPromise }) => {
  const { id: projectId, stageId } = await paramsPromise;
  const user = await requireUser();
  await requireRole(projectId, user.id, 'admin');

  const before = await prisma.stage.findUnique({ where: { id: stageId } });
  if (!before || before.projectId !== projectId) throw ApiError.notFound('Stage not found');

  await prisma.$transaction(async (tx) => {
    // Transactions tagged to this stage keep their data; the FK is ON DELETE SET NULL.
    await tx.stage.delete({ where: { id: stageId } });
    await writeAudit(tx, {
      entity: 'stage',
      entityId: stageId,
      action: 'delete',
      actorId: user.id,
      before: { ...before, plannedAmount: before.plannedAmount?.toString() ?? null },
    });
  });

  return json({ ok: true });
});
