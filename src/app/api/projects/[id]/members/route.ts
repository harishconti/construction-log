import { ApiError, handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';
import { addMemberSchema } from '@/lib/validation/schemas';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const user = await requireUser();
  await requireRole(params.id, user.id, 'viewer');

  const [members, invitations] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId: params.id },
      orderBy: { createdAt: 'asc' },
      select: {
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.invitation.findMany({
      where: { projectId: params.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, role: true, createdAt: true },
    }),
  ]);

  return json({ members, invitations });
});

export const POST = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const actor = await requireUser();
  await requireRole(params.id, actor.id, 'admin');
  const body = await parseJson(req, addMemberSchema);

  const invitee = await prisma.user.findUnique({ where: { email: body.email } });

  // No account yet → store a pending invitation that is claimed automatically on first sign-in.
  if (!invitee) {
    const invitation = await prisma.$transaction(async (tx) => {
      const saved = await tx.invitation.upsert({
        where: { projectId_email: { projectId: params.id, email: body.email } },
        update: { role: body.role },
        create: { projectId: params.id, email: body.email, role: body.role, invitedBy: actor.id },
        select: { id: true, email: true, role: true, createdAt: true },
      });
      await writeAudit(tx, {
        entity: 'member',
        entityId: saved.id,
        action: 'create',
        actorId: actor.id,
        after: { projectId: params.id, email: body.email, role: body.role, pending: true },
      });
      return saved;
    });
    return json({ pending: true, invitation }, 201);
  }

  const existingMember = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: params.id, userId: invitee.id } },
  });
  if (existingMember) throw ApiError.conflict('User is already a member of this project');

  const member = await prisma.$transaction(async (tx) => {
    // If a pending invitation existed, it is now superseded by a real membership.
    await tx.invitation.deleteMany({ where: { projectId: params.id, email: body.email } });
    const created = await tx.projectMember.create({
      data: { projectId: params.id, userId: invitee.id, role: body.role },
      select: { role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
    });
    await writeAudit(tx, {
      entity: 'member',
      entityId: invitee.id,
      action: 'create',
      actorId: actor.id,
      after: { projectId: params.id, userId: invitee.id, role: body.role },
    });
    return created;
  });

  return json({ member }, 201);
});
