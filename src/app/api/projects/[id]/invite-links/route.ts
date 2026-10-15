import { handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { rateLimit, WINDOW } from '@/lib/ratelimit';
import { writeAudit } from '@/lib/audit';
import { inviteLinkExpiry, inviteLinkPath, newInviteToken } from '@/lib/invite-links';
import { createInviteLinkSchema } from '@/lib/validation/schemas';

type Ctx = { params: Promise<{ id: string }> };

const SELECT = { id: true, role: true, createdAt: true, expiresAt: true } as const;

/** Active (unused, unrevoked, unexpired) links. Tokens are never returned after creation. */
export const GET = handle<Ctx>(async (_req, { params: paramsPromise }) => {
  const { id: projectId } = await paramsPromise;
  const user = await requireUser();
  await requireRole(projectId, user.id, 'admin');

  const links = await prisma.inviteLink.findMany({
    where: { projectId, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: SELECT,
  });
  return json({ links });
});

/** Creates a single-use join link. The raw token is in the response path exactly once. */
export const POST = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const { id: projectId } = await paramsPromise;
  const user = await requireUser();
  await requireRole(projectId, user.id, 'admin');
  await rateLimit(`invite:${user.id}`, 60, WINDOW.hour);
  const body = await parseJson(req, createInviteLinkSchema);

  const { token, tokenHash } = newInviteToken();
  const link = await prisma.$transaction(async (tx) => {
    const created = await tx.inviteLink.create({
      data: { projectId, tokenHash, role: body.role, createdBy: user.id, expiresAt: inviteLinkExpiry() },
      select: SELECT,
    });
    await writeAudit(tx, {
      entity: 'member',
      entityId: created.id,
      action: 'create',
      actorId: user.id,
      after: { projectId, role: body.role, via: 'invite_link', expiresAt: created.expiresAt },
    });
    return created;
  });

  return json({ link, path: inviteLinkPath(token) }, 201);
});
