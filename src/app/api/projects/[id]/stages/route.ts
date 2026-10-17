import { ApiError, handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';
import { listStages } from '@/lib/queries';
import { createStageSchema } from '@/lib/validation/schemas';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const user = await requireUser();
  await requireRole(params.id, user.id, 'viewer');

  return json({ stages: await listStages(params.id) });
});

export const POST = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const user = await requireUser();
  await requireRole(params.id, user.id, 'editor');
  const body = await parseJson(req, createStageSchema);

  const duplicate = await prisma.stage.findUnique({
    where: { projectId_name: { projectId: params.id, name: body.name } },
    select: { id: true },
  });
  if (duplicate) throw ApiError.conflict('A stage with this name already exists');

  const stage = await prisma.$transaction(async (tx) => {
    const created = await tx.stage.create({
      data: {
        projectId: params.id,
        name: body.name,
        plannedAmount: body.plannedAmount ?? null,
        plannedStart: body.plannedStart ?? null,
        plannedEnd: body.plannedEnd ?? null,
        order: body.order ?? 0,
        createdBy: user.id,
      },
    });
    await writeAudit(tx, {
      entity: 'stage',
      entityId: created.id,
      action: 'create',
      actorId: user.id,
      after: { ...created, plannedAmount: created.plannedAmount?.toString() ?? null },
    });
    return created;
  });

  return json({ stage: { ...stage, plannedAmount: stage.plannedAmount?.toString() ?? null } }, 201);
});
