// User mirror on first sign-in: concurrent first requests (sign-up fires router.push + refresh)
// must not 500 on the unique-key race. Prisma and Neon Auth are mocked; no database is touched.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  invitation: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));
const session = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('../src/lib/auth/server', () => ({ auth: session }));

import { getCurrentUser } from '../src/lib/auth';

const p2002 = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
const row = { id: 'u1', email: 'asha@example.com', name: 'Asha' };

beforeEach(() => {
  vi.resetAllMocks();
  session.getSession.mockResolvedValue({ data: { user: { id: 'u1', email: 'Asha@Example.com', name: 'Asha' } } });
  db.invitation.findMany.mockResolvedValue([]);
});

describe('getCurrentUser user mirror', () => {
  it('creates the mirror row on first sign-in', async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue(row);
    await expect(getCurrentUser()).resolves.toEqual(row);
    expect(db.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: row }));
  });

  it('returns the row a concurrent request inserted when create hits P2002', async () => {
    db.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(row);
    db.user.create.mockRejectedValue(p2002());
    await expect(getCurrentUser()).resolves.toEqual(row);
  });

  it('rethrows other create errors', async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockRejectedValue(new Error('db down'));
    await expect(getCurrentUser()).rejects.toThrow('db down');
  });

  it('treats a P2002 while claiming invitations as already claimed', async () => {
    db.user.findUnique.mockResolvedValue(row);
    db.invitation.findMany.mockResolvedValue([{ projectId: 'p1', role: 'editor' }]);
    db.$transaction.mockRejectedValue(p2002());
    await expect(getCurrentUser()).resolves.toEqual(row);
  });

  it('returns null when signed out', async () => {
    session.getSession.mockResolvedValue({ data: null });
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});
