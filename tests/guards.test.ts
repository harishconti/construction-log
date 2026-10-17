// Server-side guards with Prisma mocked out: role checks, rate limiting, audit writes,
// idempotent creates and attachment linking. No database is touched.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const db = vi.hoisted(() => ({
  projectMember: { findUnique: vi.fn() },
  project: { findUnique: vi.fn() },
  rateLimit: { upsert: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({ prisma: db }));

import { requireRole } from '../src/lib/requireRole';
import { rateLimit, WINDOW } from '../src/lib/ratelimit';
import { writeAudit } from '../src/lib/audit';
import { withIdempotency } from '../src/lib/idempotency';
import { linkAttachments } from '../src/lib/attachments';

const asTx = (t: unknown) => t as Prisma.TransactionClient;

beforeEach(() => {
  vi.resetAllMocks();
});

describe('requireRole', () => {
  it('allows members at or above the minimum role', async () => {
    db.projectMember.findUnique.mockResolvedValue({ role: 'editor' });
    await expect(requireRole('p1', 'u1', 'viewer')).resolves.toEqual({ projectId: 'p1', userId: 'u1', role: 'editor' });
    await expect(requireRole('p1', 'u1', 'editor')).resolves.toMatchObject({ role: 'editor' });
  });

  it('rejects members below the minimum role with 403', async () => {
    db.projectMember.findUnique.mockResolvedValue({ role: 'viewer' });
    await expect(requireRole('p1', 'u1', 'editor')).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    db.projectMember.findUnique.mockResolvedValue({ role: 'editor' });
    await expect(requireRole('p1', 'u1', 'admin')).rejects.toMatchObject({ status: 403 });
  });

  it('returns 403 for non-members of an existing project', async () => {
    db.projectMember.findUnique.mockResolvedValue(null);
    db.project.findUnique.mockResolvedValue({ id: 'p1' });
    await expect(requireRole('p1', 'u1', 'viewer')).rejects.toMatchObject({ status: 403 });
  });

  it('returns 404 when the project does not exist', async () => {
    db.projectMember.findUnique.mockResolvedValue(null);
    db.project.findUnique.mockResolvedValue(null);
    await expect(requireRole('nope', 'u1', 'viewer')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('looks membership up by the composite (projectId, userId) key', async () => {
    db.projectMember.findUnique.mockResolvedValue({ role: 'admin' });
    await requireRole('p1', 'u1', 'admin');
    expect(db.projectMember.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId_userId: { projectId: 'p1', userId: 'u1' } } }),
    );
  });
});

describe('rateLimit', () => {
  it('passes while the window count is within the limit', async () => {
    db.rateLimit.upsert.mockResolvedValue({ count: 5 });
    await expect(rateLimit('tx:u1', 5, WINDOW.minute)).resolves.toBeUndefined();
  });

  it('throws 429 RATE_LIMITED once the limit is exceeded', async () => {
    db.rateLimit.upsert.mockResolvedValue({ count: 6 });
    await expect(rateLimit('tx:u1', 5, WINDOW.minute)).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' });
  });

  it('buckets by a window start aligned to the window size', async () => {
    db.rateLimit.upsert.mockResolvedValue({ count: 1 });
    await rateLimit('b', 10, WINDOW.hour);
    const arg = db.rateLimit.upsert.mock.calls[0][0];
    expect(arg.where.bucket_windowStart.bucket).toBe('b');
    expect(arg.where.bucket_windowStart.windowStart.getTime() % WINDOW.hour).toBe(0);
  });
});

describe('writeAudit', () => {
  it('writes through the supplied transaction client and JSON-normalises payloads', async () => {
    const create = vi.fn();
    await writeAudit(asTx({ auditLog: { create } }), {
      entity: 'transaction',
      entityId: 't1',
      action: 'update',
      actorId: 'u1',
      before: { at: new Date('2026-10-14T00:00:00Z') },
      after: null,
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        entity: 'transaction',
        entityId: 't1',
        action: 'update',
        actorId: 'u1',
        before: { at: '2026-10-14T00:00:00.000Z' },
        after: Prisma.JsonNull,
      },
    });
  });

  it('omits before/after when not provided', async () => {
    const create = vi.fn();
    await writeAudit(asTx({ auditLog: { create } }), { entity: 'project', entityId: 'p', action: 'create', actorId: 'u' });
    expect(create.mock.calls[0][0].data.before).toBeUndefined();
    expect(create.mock.calls[0][0].data.after).toBeUndefined();
  });
});

describe('withIdempotency', () => {
  function fakeTx(stored?: { requestHash: string; response: unknown }) {
    const tx = {
      $executeRaw: vi.fn(),
      idempotencyKey: {
        findUnique: vi.fn().mockResolvedValue(stored ?? null),
        create: vi.fn(),
      },
    };
    db.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
    return tx;
  }
  const opts = { projectId: 'p1', userId: 'u1', key: 'k1', body: { amount: 10 } };

  it('runs once, takes an advisory lock and stores the response', async () => {
    const tx = fakeTx();
    const run = vi.fn().mockResolvedValue({ id: 't1' });
    await expect(withIdempotency(opts, run)).resolves.toEqual({ data: { id: 't1' }, replayed: false });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(tx);
    expect(tx.idempotencyKey.create.mock.calls[0][0].data).toMatchObject({
      projectId: 'p1',
      userId: 'u1',
      key: 'k1',
      response: { id: 't1' },
    });
  });

  it('replays the stored response for the same key and body without re-running', async () => {
    // Capture the hash the first call stores, then replay with it.
    const first = fakeTx();
    await withIdempotency(opts, async () => ({ id: 't1' }));
    const { requestHash } = first.idempotencyKey.create.mock.calls[0][0].data;

    fakeTx({ requestHash, response: { id: 't1' } });
    const run = vi.fn();
    await expect(withIdempotency(opts, run)).resolves.toEqual({ data: { id: 't1' }, replayed: true });
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects key reuse with a different body (409)', async () => {
    fakeTx({ requestHash: 'different', response: {} });
    await expect(withIdempotency(opts, vi.fn())).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });
  });

  it('without a key, still runs inside a transaction but records nothing', async () => {
    const tx = fakeTx();
    const res = await withIdempotency({ ...opts, key: '  ' }, async () => 'ok');
    expect(res).toEqual({ data: 'ok', replayed: false });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.idempotencyKey.create).not.toHaveBeenCalled();
  });
});

describe('linkAttachments', () => {
  type Row = {
    id: string;
    projectId: string;
    status: string;
    transactionId: string | null;
    diaryEntryId: string | null;
    fundingId: string | null;
  };
  const ready = (id: string, over: Partial<Row> = {}): Row => ({
    id,
    projectId: 'p1',
    status: 'ready',
    transactionId: null,
    diaryEntryId: null,
    fundingId: null,
    ...over,
  });
  function tx(rows: Row[], { already = 0, updated = rows.length } = {}) {
    return {
      attachment: {
        count: vi.fn().mockResolvedValue(already),
        findMany: vi.fn().mockResolvedValue(rows),
        updateMany: vi.fn().mockResolvedValue({ count: updated }),
      },
    };
  }
  const link = (t: ReturnType<typeof tx>, ids: string[]) =>
    linkAttachments(asTx(t), { projectId: 'p1', parent: 'transaction', parentId: 't1', attachmentIds: ids });

  it('links ready, unlinked attachments with a guarded update', async () => {
    const t = tx([ready('a'), ready('b')]);
    await expect(link(t, ['a', 'b'])).resolves.toBeUndefined();
    expect(t.attachment.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['a', 'b'] },
        projectId: 'p1',
        status: 'ready',
        transactionId: null,
        diaryEntryId: null,
        fundingId: null,
      },
      data: { transactionId: 't1' },
    });
  });

  it('links attachments to a funding parent', async () => {
    const t = tx([ready('a')]);
    await linkAttachments(asTx(t), { projectId: 'p1', parent: 'funding', parentId: 'f1', attachmentIds: ['a'] });
    expect(t.attachment.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['a'] },
        projectId: 'p1',
        status: 'ready',
        transactionId: null,
        diaryEntryId: null,
        fundingId: null,
      },
      data: { fundingId: 'f1' },
    });
  });

  it('is a no-op for an empty list', async () => {
    const t = tx([]);
    await link(t, []);
    expect(t.attachment.count).not.toHaveBeenCalled();
  });

  it('enforces the 10-per-record cap including existing attachments', async () => {
    const t = tx([ready('a')], { already: 10 });
    await expect(link(t, ['a'])).rejects.toMatchObject({ code: 'TOO_MANY_ATTACHMENTS' });
  });

  it.each([
    ['another project', ready('a', { projectId: 'p2' }), /another project/],
    ['pending upload', ready('a', { status: 'pending' }), /not been finalized/],
    ['already linked', ready('a', { diaryEntryId: 'd1' }), /already attached/],
    ['already linked to funding', ready('a', { fundingId: 'f1' }), /already attached/],
  ])('rejects an attachment from %s', async (_label, row, msg) => {
    await expect(link(tx([row]), ['a'])).rejects.toThrow(msg);
  });

  it('rejects unknown ids', async () => {
    await expect(link(tx([]), ['ghost'])).rejects.toThrow(/not found/);
  });

  it('detects a concurrent claim via the update count (ATTACHMENT_CONFLICT)', async () => {
    const t = tx([ready('a'), ready('b')], { updated: 1 });
    await expect(link(t, ['a', 'b'])).rejects.toMatchObject({ code: 'ATTACHMENT_CONFLICT' });
  });
});
