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

  const members = await prisma.projectMember.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: 'asc' },
    select: {
      role: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return json({ members });
});

export const POST = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const actor = await requireUser();
  await requireRole(params.id, actor.id, 'admin');
  const body = await parseJson(req, addMemberSchema);

  const invitee = await prisma.user.findUnique({ where: { email: body.email } });
  if (!invitee) {
    throw ApiError.notFound(
      'No account exists for that email yet. Ask them to sign up first, then invite.',
    );
  }

  const existingMember = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: params.id, userId: invitee.id } },
  });
  if (existingMember) {
    throw ApiError.conflict('User is already a member of this project');
  }

  const member = await prisma.$transaction(async (tx) => {
    const created = await tx.projectMember.create({
      data: { projectId: params.id, userId: invitee.id, role: body.role },
      select: {
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
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
