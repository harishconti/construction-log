import { cache } from 'react';
import { ApiError } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { writeAudit } from '@/lib/audit';
import { auth } from './server';

export type AppUser = {
  id: string;
  name: string;
  email: string;
};

type NeonUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

/**
 * Neon Auth can return a user with no email (e.g. phone OTP). We still need a
 * unique, non-null email for our mirror row; synthesize a stable placeholder.
 */
function normalise(u: NeonUser): { id: string; email: string; name: string } {
  const email = (u.email ?? `${u.id}@neon-auth.local`).toLowerCase();
  const name = u.name?.trim() || email.split('@')[0];
  return { id: u.id, email, name };
}

async function mirrorUser(u: NeonUser): Promise<AppUser> {
  const { id, email, name } = normalise(u);

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true },
  });
  if (existing) {
    // Avoid a write on every request when nothing changed.
    if (existing.email === email && existing.name === name) {
      await claimInvitations(existing);
      return existing;
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { email, name },
      select: { id: true, name: true, email: true },
    });
    await claimInvitations(updated);
    return updated;
  }

  const created = await prisma.user.create({
    data: { id, email, name },
    select: { id: true, name: true, email: true },
  });
  await claimInvitations(created);
  return created;
}

/** Applies any non-expired pending email invitations once the account exists. Idempotent and cheap when empty. */
async function claimInvitations(user: { id: string; email: string }): Promise<void> {
  const invitations = await prisma.invitation.findMany({
    where: { email: user.email, expiresAt: { gt: new Date() } },
    select: { projectId: true, role: true },
  });
  if (invitations.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const inv of invitations) {
      const existing = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId: inv.projectId, userId: user.id } },
      });
      if (existing) continue;
      await tx.projectMember.create({
        data: { projectId: inv.projectId, userId: user.id, role: inv.role },
      });
      await writeAudit(tx, {
        entity: 'member',
        entityId: user.id,
        action: 'create',
        actorId: user.id,
        after: { projectId: inv.projectId, userId: user.id, role: inv.role, via: 'invitation' },
      });
    }
    await tx.invitation.deleteMany({ where: { email: user.email } });
  });
}

/** Returns the signed-in app user (mirrored locally), or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const { data: session } = await auth.getSession();
  const neonUser = session?.user as NeonUser | undefined;
  if (!neonUser?.id) return null;
  return mirrorUser(neonUser);
});

/** Like getCurrentUser but throws 401 when unauthenticated. */
export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) throw ApiError.unauthorized();
  return user;
}
