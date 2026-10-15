import { ApiError, handle, json } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string; linkId: string }> };

/** Revokes a link. Idempotent; used links stay as history. */
export const DELETE = handle<Ctx>(async (_req, { params: paramsPromise }) => {
  const { id: projectId, linkId } = await paramsPromise;
  const user = await requireUser();
  await requireRole(projectId, user.id, 'admin');

  const link = await prisma.inviteLink.findUnique({ where: { id: linkId } });
  if (!link || link.projectId !== projectId) throw ApiError.notFound('Invite link not found');
  if (link.revokedAt || link.usedAt) return json({ ok: true });

  await prisma.$transaction(async (tx) => {
    await tx.inviteLink.update({ where: { id: linkId }, data: { revokedAt: new Date() } });
    await writeAudit(tx, {
      entity: 'member',
      entityId: linkId,
      action: 'delete',
      actorId: user.id,
      before: { projectId, role: link.role, via: 'invite_link' },
    });
  });
  return json({ ok: true });
});
