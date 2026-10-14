import { ApiError, handle, json } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string; invitationId: string }> };

export const DELETE = handle<Ctx>(async (_req, { params: paramsPromise }) => {
  const { id: projectId, invitationId } = await paramsPromise;
  const user = await requireUser();
  await requireRole(projectId, user.id, 'admin');

  const invitation = await prisma.invitation.findUnique({ where: { id: invitationId } });
  if (!invitation || invitation.projectId !== projectId) throw ApiError.notFound('Invitation not found');

  await prisma.$transaction(async (tx) => {
    await tx.invitation.delete({ where: { id: invitationId } });
    await writeAudit(tx, {
      entity: 'member',
      entityId: invitationId,
      action: 'delete',
      actorId: user.id,
      before: { projectId, email: invitation.email, role: invitation.role, pending: true },
    });
  });

  return json({ ok: true });
});
