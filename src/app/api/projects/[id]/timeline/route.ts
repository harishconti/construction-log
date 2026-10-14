import { getPagination, handle, json } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';

type Ctx = { params: Promise<{ id: string }> };
const FETCH_CAP = 500;

export const GET = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const user = await requireUser();
  await requireRole(params.id, user.id, 'viewer');

  const url = new URL(req.url);
  const { page, limit } = getPagination(url, 25, 100);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  const occurredAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };
  const hasRange = Boolean(from || to);

  const [txs, diaries] = await Promise.all([
    prisma.transaction.findMany({
      where: { projectId: params.id, deletedAt: null, ...(hasRange ? { occurredAt } : {}) },
      orderBy: { occurredAt: 'desc' },
      take: FETCH_CAP,
      include: { category: { select: { id: true, name: true, type: true } } },
    }),
    prisma.diaryEntry.findMany({
      where: { projectId: params.id, ...(hasRange ? { entryDate: occurredAt } : {}) },
      orderBy: { entryDate: 'desc' },
      take: FETCH_CAP,
      select: { id: true, entryDate: true, title: true, body: true, createdBy: true },
    }),
  ]);

  const merged = [
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
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const total = merged.length;
  const items = merged.slice((page - 1) * limit, (page - 1) * limit + limit);

  return json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});
