import { InviteJoin, type InviteState } from '@/components/InviteJoin';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hashInviteToken, inviteLinkState, isInviteToken } from '@/lib/invite-links';

export const dynamic = 'force-dynamic';

/**
 * Public landing page for a shared invite link. Rendering never consumes the link: joining is an
 * explicit POST from the client, so chat-app link previews can't use it up.
 */
export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ join?: string }>;
}) {
  const { token } = await params;
  const { join } = await searchParams;

  const link = isInviteToken(token)
    ? await prisma.inviteLink.findUnique({
        where: { tokenHash: hashInviteToken(token) },
        select: {
          projectId: true,
          role: true,
          usedAt: true,
          revokedAt: true,
          expiresAt: true,
          project: { select: { name: true } },
        },
      })
    : null;
  const user = await getCurrentUser();

  let state: InviteState;
  if (!link) state = 'invalid';
  else if (
    user &&
    (await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: link.projectId, userId: user.id } },
      select: { role: true },
    }))
  )
    state = 'member';
  else {
    const s = inviteLinkState(link);
    state = s !== 'active' ? s : user ? 'ready' : 'signed-out';
  }

  return (
    <InviteJoin
      token={token}
      state={state}
      projectId={link?.projectId ?? null}
      projectName={link?.project.name ?? null}
      role={link?.role ?? null}
      userEmail={user?.email ?? null}
      autoJoin={join === '1'}
    />
  );
}
