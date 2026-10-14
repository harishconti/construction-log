import { Prisma } from '@prisma/client';
import { ApiError, handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';
import { updateMemberRoleSchema } from '@/lib/validation/schemas';

type Ctx = { params: Promise<{ id: string; userId: string }> };

async function assertNotLastAdmin(
  tx: Prisma.TransactionClient,
  projectId: string,
  userId: string,
): Promise<void> {
  const target = await tx.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  if (target?.role !== 'admin') return;

  const adminCount = await tx.projectMember.count({ where: { projectId, role: 'admin' } });
  if (adminCount <= 1) {
    throw ApiError.conflict('Cannot remove or demote the last admin of the project');
  }
}

export const PATCH = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const actor = await requireUser();
  await requireRole(params.id, actor.id, 'admin');
  const body = await parseJson(req, updateMemberRoleSchema);

  // Serializable so two concurrent demotions cannot both observe two admins and leave zero.
  const member = await prisma.$transaction(
    async (tx) => {
      const before = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId: params.id, userId: params.userId } },
        select: { role: true },
      });
      if (!before) throw ApiError.notFound('Member not found');

      if (before.role === 'admin' && body.role !== 'admin') {
        await assertNotLastAdmin(tx, params.id, params.userId);
      }

      const updated = await tx.projectMember.update({
        where: { projectId_userId: { projectId: params.id, userId: params.userId } },
        data: { role: body.role },
        select: { role: true, user: { select: { id: true, name: true, email: true } } },
      });
      await writeAudit(tx, {
        entity: 'member',
        entityId: params.userId,
        action: 'role_change',
        actorId: actor.id,
        before: { role: before.role },
        after: { role: body.role },
      });
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  return json({ member });
});

export const DELETE = handle<Ctx>(async (_req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const actor = await requireUser();
  await requireRole(params.id, actor.id, 'admin');

  await prisma.$transaction(
    async (tx) => {
      const before = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId: params.id, userId: params.userId } },
      });
      if (!before) throw ApiError.notFound('Member not found');

      await assertNotLastAdmin(tx, params.id, params.userId);
      await tx.projectMember.delete({
        where: { projectId_userId: { projectId: params.id, userId: params.userId } },
      });
      await writeAudit(tx, {
        entity: 'member',
        entityId: params.userId,
        action: 'delete',
        actorId: actor.id,
        before: { projectId: params.id, userId: params.userId, role: before.role },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  return json({ ok: true });
});
