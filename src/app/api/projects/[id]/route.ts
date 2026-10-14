import { handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';
import { updateProjectSchema } from '@/lib/validation/schemas';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const user = await requireUser();
  await requireRole(params.id, user.id, 'viewer');

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      startDate: true,
      createdAt: true,
      _count: { select: { transactions: true, diaryEntries: true, members: true } },
    },
  });

  return json({ project });
});

export const PATCH = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const user = await requireUser();
  await requireRole(params.id, user.id, 'admin');
  const body = await parseJson(req, updateProjectSchema);

  const before = await prisma.project.findUnique({ where: { id: params.id } });

  const project = await prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id: params.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.startDate !== undefined ? { startDate: body.startDate } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
    });
    await writeAudit(tx, {
      entity: 'project',
      entityId: updated.id,
      action: 'update',
      actorId: user.id,
      before,
      after: updated,
    });
    return updated;
  });

  return json({ project });
});
