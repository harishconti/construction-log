import { ApiError, handle, json } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string; fundingId: string }> };

export const POST = handle<Ctx>(async (_req, { params: paramsPromise }) => {
  const { id: projectId, fundingId } = await paramsPromise;
  const user = await requireUser();
  await requireRole(projectId, user.id, 'admin');

  const before = await prisma.funding.findUnique({ where: { id: fundingId } });
  if (!before || before.projectId !== projectId) throw ApiError.notFound('Funding entry not found');
  if (!before.deletedAt) return json({ ok: true });

  await prisma.$transaction(async (tx) => {
    await tx.funding.update({
      where: { id: fundingId },
      data: { deletedAt: null, version: { increment: 1 } },
    });
    await writeAudit(tx, {
      entity: 'funding',
      entityId: fundingId,
      action: 'restore',
      actorId: user.id,
      after: { deletedAt: null },
    });
  });

  return json({ ok: true });
});
