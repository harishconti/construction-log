import { handle, json, parseOptionalDate } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';

type Ctx = { params: Promise<{ id: string }> };

type MergedItem = {
  type: 'transaction' | 'diary';
  id: string;
  date: Date;
  [k: string]: unknown;
};

/**
 * Merged transaction + diary feed using keyset (cursor) pagination on `(date, id)`, so it scales past
 * any fixed fetch cap. `before` is the opaque cursor returned as `nextCursor`.
 */
export const GET = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const user = await requireUser();
  await requireRole(params.id, user.id, 'viewer');

  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '25') || 25));
  const from = parseOptionalDate(url.searchParams.get('from'));
  const to = parseOptionalDate(url.searchParams.get('to'));

  const beforeRaw = url.searchParams.get('before');
  let cursorDate: Date | undefined;
  let cursorId: string | undefined;
  if (beforeRaw) {
    const [d, id] = beforeRaw.split('|');
    const parsed = new Date(d);
    if (!Number.isNaN(parsed.getTime()) && id) {
      cursorDate = parsed;
      cursorId = id;
    }
  }

  const range = {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
    ...(cursorDate ? { lte: cursorDate } : {}),
  };
  const hasRange = Object.keys(range).length > 0;

  const [txs, diaries] = await Promise.all([
    prisma.transaction.findMany({
      where: { projectId: params.id, deletedAt: null, ...(hasRange ? { occurredAt: range } : {}) },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { category: { select: { id: true, name: true, type: true } } },
    }),
    prisma.diaryEntry.findMany({
      where: { projectId: params.id, ...(hasRange ? { entryDate: range } : {}) },
      orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: { id: true, entryDate: true, title: true, body: true, createdBy: true },
    }),
  ]);

  const merged: MergedItem[] = [
    ...txs.map((t) => ({
      type: 'transaction' as const,
      id: t.id,
      date: t.occurredAt,
      amount: t.amount.toString(),
      gstAmount: t.gstAmount.toString(),
      vendor: t.vendor,
      paymentMode: t.paymentMode,
      description: t.description,
      category: t.category,
      createdBy: t.createdBy,
    })),
    ...diaries.map((d) => ({
      type: 'diary' as const,
      id: d.id,
      date: d.entryDate,
      title: d.title,
      body: d.body,
      createdBy: d.createdBy,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime() || (a.id < b.id ? 1 : -1));

  const beforeCursor = (item: MergedItem): boolean => {
    if (!cursorDate || !cursorId) return true;
    const t = item.date.getTime();
    if (t < cursorDate.getTime()) return true;
    if (t > cursorDate.getTime()) return false;
    return item.id < cursorId;
  };

  const eligible = merged.filter(beforeCursor);
  const items = eligible.slice(0, limit).map((it) => ({ ...it, date: it.date.toISOString() }));
  const last = eligible[limit - 1];
  const nextCursor = last ? `${last.date.toISOString()}|${last.id}` : null;
  const hasMore = eligible.length > limit;

  return json({ items, nextCursor, hasMore });
});
