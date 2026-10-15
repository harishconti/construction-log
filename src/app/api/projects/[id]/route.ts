import { ApiError, handle, json, parseJson } from '@/lib/api';
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
      locationName: true,
      latitude: true,
      longitude: true,
      createdAt: true,
      _count: {
        select: {
          transactions: { where: { deletedAt: null } },
          diaryEntries: true,
          members: true,
        },
      },
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
  if (!before) throw ApiError.notFound('Project not found');

  if (body.version !== undefined && body.version !== before.version) {
    throw new ApiError(409, 'VERSION_CONFLICT', 'Project was modified by someone else');
  }

  const project = await prisma.$transaction(async (tx) => {
    const res = await tx.project.updateMany({
      where: { id: params.id, version: before.version },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.startDate !== undefined ? { startDate: body.startDate } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.locationName !== undefined ? { locationName: body.locationName } : {}),
        ...(body.latitude !== undefined ? { latitude: body.latitude } : {}),
        ...(body.longitude !== undefined ? { longitude: body.longitude } : {}),
        version: { increment: 1 },
      },
    });
    if (res.count === 0) {
      throw new ApiError(409, 'VERSION_CONFLICT', 'Project was modified by someone else');
    }
    const updated = await tx.project.findUnique({ where: { id: params.id } });
    await writeAudit(tx, {
      entity: 'project',
      entityId: params.id,
      action: 'update',
      actorId: user.id,
      before,
      after: updated,
    });
    return updated;
  });

  return json({ project });
});
