import { cache } from 'react';
import { Prisma } from '@prisma/client';
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

  // Both lookups only need the session's (normalised) email, so run them together: this runs on
  // every page and API request, and it saves a sequential database round trip each time.
  const [existing, pending] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true } }),
    pendingInvitations(email),
  ]);
  if (existing) {
    // Avoid a write on every request when nothing changed.
    if (existing.email === email && existing.name === name) {
      await claimInvitations(existing, pending);
      return existing;
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { email, name },
      select: { id: true, name: true, email: true },
    });
    await claimInvitations(updated, pending);
    return updated;
  }

  let created: AppUser;
  try {
    created = await prisma.user.create({
      data: { id, email, name },
      select: { id: true, name: true, email: true },
    });
  } catch (err) {
    // A concurrent first request for this user won the insert (sign-up fires router.push + refresh).
    if (!isUniqueViolation(err)) throw err;
    const row = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true } });
    if (!row) throw err;
    created = row;
  }
  await claimInvitations(created, pending);
  return created;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** Applies any non-expired pending email invitations once the account exists. Idempotent and cheap when empty. */
function pendingInvitations(email: string) {
  return prisma.invitation.findMany({
    where: { email, expiresAt: { gt: new Date() } },
    select: { projectId: true, role: true },
  });
}

async function claimInvitations(
  user: { id: string; email: string },
  invitations: Awaited<ReturnType<typeof pendingInvitations>>,
): Promise<void> {
  if (invitations.length === 0) return;

  try {
    await claimInTransaction(user, invitations);
  } catch (err) {
    // A concurrent request for the same user already claimed these invitations.
    if (!isUniqueViolation(err)) throw err;
  }
}

async function claimInTransaction(
  user: { id: string; email: string },
  invitations: { projectId: string; role: string }[],
): Promise<void> {
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
