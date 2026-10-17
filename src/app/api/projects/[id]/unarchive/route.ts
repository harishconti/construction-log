import { ApiError, handle, json } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle<Ctx>(async (_req, { params: paramsPromise }) => {
  const { id } = await paramsPromise;
  const user = await requireUser();
  await requireRole(id, user.id, 'admin');

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw ApiError.notFound('Project not found');
  const archivedBefore = project.archivedAt;
  if (!archivedBefore) return json({ ok: true });

  await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id }, data: { archivedAt: null, version: { increment: 1 } } });
    await writeAudit(tx, {
      entity: 'project',
      entityId: id,
      action: 'unarchive',
      actorId: user.id,
      before: { archivedAt: archivedBefore.toISOString() },
      after: { archivedAt: null },
    });
  });

  return json({ ok: true });
});
