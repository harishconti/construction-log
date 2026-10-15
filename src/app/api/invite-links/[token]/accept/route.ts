import { ApiError, handle, json } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit, WINDOW } from '@/lib/ratelimit';
import { writeAudit } from '@/lib/audit';
import { hashInviteToken, inviteLinkState, isInviteToken } from '@/lib/invite-links';

type Ctx = { params: Promise<{ token: string }> };

const GONE: Record<string, [string, string]> = {
  used: ['INVITE_LINK_USED', 'This invite link has already been used'],
  revoked: ['INVITE_LINK_REVOKED', 'This invite link was cancelled by the project admin'],
  expired: ['INVITE_LINK_EXPIRED', 'This invite link has expired'],
};

/**
 * Joins the signed-in user to the link's project with the link's role. Must be a POST from the
 * app (never a GET), so link-preview crawlers can't consume single-use links.
 */
export const POST = handle<Ctx>(async (_req, { params: paramsPromise }) => {
  const { token } = await paramsPromise;
  const user = await requireUser();
  await rateLimit(`invite-accept:${user.id}`, 20, WINDOW.hour);
  if (!isInviteToken(token)) throw ApiError.notFound('Invite link not found');

  const result = await prisma.$transaction(async (tx) => {
    const link = await tx.inviteLink.findUnique({ where: { tokenHash: hashInviteToken(token) } });
    if (!link) throw ApiError.notFound('Invite link not found');

    // Already in the project (including a retried request after this user consumed it): no-op.
    const member = await tx.projectMember.findUnique({
      where: { projectId_userId: { projectId: link.projectId, userId: user.id } },
      select: { role: true },
    });
    if (member) return { projectId: link.projectId, role: member.role, joined: false };

    const state = inviteLinkState(link);
    if (state !== 'active') {
      const [code, message] = GONE[state];
      throw new ApiError(410, code, message);
    }

    // Single statement claim: only one concurrent request can flip usedAt.
    const claimed = await tx.inviteLink.updateMany({
      where: { id: link.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date(), usedBy: user.id },
    });
    if (claimed.count === 0) throw new ApiError(410, ...GONE.used);

    await tx.projectMember.create({ data: { projectId: link.projectId, userId: user.id, role: link.role } });
    // A pending email invitation for the same person is superseded.
    await tx.invitation.deleteMany({ where: { projectId: link.projectId, email: user.email } });
    await writeAudit(tx, {
      entity: 'member',
      entityId: user.id,
      action: 'create',
      actorId: user.id,
      after: { projectId: link.projectId, userId: user.id, role: link.role, via: 'invite_link', linkId: link.id },
    });
    return { projectId: link.projectId, role: link.role, joined: true };
  });

  return json(result);
});
