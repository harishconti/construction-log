// DPDP account-erasure processing with Prisma mocked: the batch job must anonymise the account,
// delete projects the user solely owned (queueing their R2 objects) and hand shared projects on.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const db = vi.hoisted(() => ({
  deletionRequest: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({ prisma: db }));

import { ANONYMISED_NAME, anonymisedEmail, processDueDeletions } from '../src/lib/account';

type Tx = Record<string, Record<string, ReturnType<typeof vi.fn>>>;

function makeTx(overrides: Tx): Tx {
  const base: Tx = {
    deletionRequest: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    projectMember: { findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    attachment: { findMany: vi.fn() },
    objectDeletion: { createMany: vi.fn() },
    project: { delete: vi.fn() },
    invitation: { deleteMany: vi.fn() },
    idempotencyKey: { deleteMany: vi.fn() },
    consentRecord: { deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { ...base, ...overrides };
}

function useTx(tx: Tx) {
  db.$transaction.mockImplementation(
    async (fn: (client: Prisma.TransactionClient) => unknown) =>
      fn(tx as unknown as Prisma.TransactionClient),
  );
}

const NOW = new Date('2026-11-15T00:00:00Z');

beforeEach(() => {
  vi.resetAllMocks();
});

describe('processDueDeletions', () => {
  it('does nothing when no request is due', async () => {
    db.deletionRequest.findMany.mockResolvedValue([]);
    const result = await processDueDeletions(NOW);
    expect(result).toEqual({ processed: 0, projectsDeleted: 0, objectsQueued: 0, membershipsRemoved: 0 });
    expect(db.$transaction).not.toHaveBeenCalled();
    // Only due, still-pending requests are selected.
    expect(db.deletionRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'pending', scheduledFor: { lte: NOW } } }),
    );
  });

  it('erases a solely-owned project and anonymises the account', async () => {
    db.deletionRequest.findMany.mockResolvedValue([{ id: 'dr1', userId: 'u1' }]);
    const tx = makeTx({
      deletionRequest: {
        findUnique: vi.fn().mockResolvedValue({ id: 'dr1', status: 'pending' }),
        update: vi.fn(),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'u1', email: 'owner@example.com' }),
        update: vi.fn(),
      },
      projectMember: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'pm1',
            role: 'admin',
            projectId: 'p1',
            project: {
              id: 'p1',
              members: [{ id: 'pm1', userId: 'u1', role: 'admin', createdAt: new Date('2026-01-01') }],
            },
          },
        ]),
        update: vi.fn(),
        delete: vi.fn(),
      },
      attachment: { findMany: vi.fn().mockResolvedValue([{ fileKey: 'k1' }, { fileKey: 'k2' }]) },
      objectDeletion: { createMany: vi.fn() },
      project: { delete: vi.fn() },
    });
    useTx(tx);

    const result = await processDueDeletions(NOW);

    expect(result).toEqual({ processed: 1, projectsDeleted: 1, objectsQueued: 2, membershipsRemoved: 0 });
    expect(tx.project.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    expect(tx.objectDeletion.createMany).toHaveBeenCalledTimes(1);
    expect(tx.objectDeletion.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { name: ANONYMISED_NAME, email: anonymisedEmail('u1'), deletedAt: NOW },
    });
    expect(tx.deletionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.consentRecord.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('hands a shared project to the longest-standing member when the last admin leaves', async () => {
    db.deletionRequest.findMany.mockResolvedValue([{ id: 'dr2', userId: 'u1' }]);
    const tx = makeTx({
      deletionRequest: {
        findUnique: vi.fn().mockResolvedValue({ id: 'dr2', status: 'pending' }),
        update: vi.fn(),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'u1', email: 'owner@example.com' }),
        update: vi.fn(),
      },
      projectMember: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'pm1',
            role: 'admin',
            projectId: 'p1',
            project: {
              id: 'p1',
              members: [
                { id: 'pm1', userId: 'u1', role: 'admin', createdAt: new Date('2026-01-03') },
                { id: 'pm2', userId: 'u2', role: 'editor', createdAt: new Date('2026-01-01') },
                { id: 'pm3', userId: 'u3', role: 'viewer', createdAt: new Date('2026-01-02') },
              ],
            },
          },
        ]),
        update: vi.fn(),
        delete: vi.fn(),
      },
      attachment: { findMany: vi.fn().mockResolvedValue([]) },
    });
    useTx(tx);

    const result = await processDueDeletions(NOW);

    expect(result).toEqual({ processed: 1, projectsDeleted: 0, objectsQueued: 0, membershipsRemoved: 1 });
    expect(tx.project.delete).not.toHaveBeenCalled();
    // u2 is the longest-standing remaining member.
    expect(tx.projectMember.update).toHaveBeenCalledWith({ where: { id: 'pm2' }, data: { role: 'admin' } });
    expect(tx.projectMember.delete).toHaveBeenCalledWith({ where: { id: 'pm1' } });
  });

  it('skips a request that was cancelled before the job ran', async () => {
    db.deletionRequest.findMany.mockResolvedValue([{ id: 'dr3', userId: 'u1' }]);
    const tx = makeTx({
      deletionRequest: {
        findUnique: vi.fn().mockResolvedValue({ id: 'dr3', status: 'cancelled' }),
        update: vi.fn(),
      },
    });
    useTx(tx);

    const result = await processDueDeletions(NOW);

    expect(result.processed).toBe(0);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('keeps going when one request throws', async () => {
    db.deletionRequest.findMany.mockResolvedValue([
      { id: 'bad', userId: 'u1' },
      { id: 'ok', userId: 'u2' },
    ]);
    let call = 0;
    db.$transaction.mockImplementation(async (fn: (client: Prisma.TransactionClient) => unknown) => {
      call += 1;
      if (call === 1) throw new Error('boom');
      const tx = makeTx({
        deletionRequest: {
          findUnique: vi.fn().mockResolvedValue({ id: 'ok', status: 'pending' }),
          update: vi.fn(),
        },
        user: {
          findUnique: vi.fn().mockResolvedValue({ id: 'u2', email: 'b@example.com' }),
          update: vi.fn(),
        },
        projectMember: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn(), delete: vi.fn() },
        attachment: { findMany: vi.fn() },
      });
      return fn(tx as unknown as Prisma.TransactionClient);
    });

    const result = await processDueDeletions(NOW);
    expect(result.processed).toBe(1);
  });
});

describe('anonymisedEmail', () => {
  it('is unique per user and cannot be delivered to', () => {
    expect(anonymisedEmail('abc')).toBe('deleted+abc@deleted.invalid');
    expect(anonymisedEmail('abc')).not.toBe(anonymisedEmail('xyz'));
  });
});
