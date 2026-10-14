import { ApiError, handle, json } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string; txId: string }> };

export const POST = handle<Ctx>(async (_req, { params: paramsPromise }) => {
  const { id: projectId, txId } = await paramsPromise;
  const user = await requireUser();
  await requireRole(projectId, user.id, 'admin');

  const before = await prisma.transaction.findUnique({ where: { id: txId } });
  if (!before || before.projectId !== projectId) throw ApiError.notFound('Transaction not found');
  if (!before.deletedAt) return json({ ok: true });

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: txId },
      data: { deletedAt: null, version: { increment: 1 } },
    });
    await writeAudit(tx, {
      entity: 'transaction',
      entityId: txId,
      action: 'restore',
      actorId: user.id,
      after: { deletedAt: null },
    });
  });

  return json({ ok: true });
});
