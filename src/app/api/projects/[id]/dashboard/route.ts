import { ApiError, handle, json } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { computeVariance } from '@/lib/budget';
import { parsePeriodParam, periodRange, startOfMonthIST } from '@/lib/period';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const user = await requireUser();
  await requireRole(params.id, user.id, 'viewer');

  const url = new URL(req.url);
  const monthParam = url.searchParams.get('date') ?? url.searchParams.get('period');
  const periodStart = monthParam ? parsePeriodParam('month', monthParam) : startOfMonthIST(new Date());
  if (!periodStart) throw ApiError.badRequest('Invalid period parameter', 'INVALID_PERIOD');
  const { start, end } = periodRange('month', periodStart);

  const [totalAgg, periodAgg, grouped, budgets, categories, recentTx, recentDiary, fundingAgg, periodFundingAgg, fundingGrouped] = await Promise.all([
    prisma.transaction.aggregate({ where: { projectId: params.id, deletedAt: null }, _sum: { amount: true }, _count: true }),
    prisma.transaction.aggregate({
      where: { projectId: params.id, deletedAt: null, occurredAt: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { projectId: params.id, deletedAt: null, occurredAt: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    prisma.budget.findMany({ where: { projectId: params.id, periodType: 'month', periodStart } }),
    prisma.category.findMany({ where: { projectId: params.id }, select: { id: true, name: true } }),
    prisma.transaction.findMany({
      where: { projectId: params.id, deletedAt: null },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: 5,
      include: { category: { select: { name: true } } },
    }),
    prisma.diaryEntry.findMany({
      where: { projectId: params.id },
      orderBy: { entryDate: 'desc' },
      take: 3,
      select: { id: true, entryDate: true, title: true },
    }),
    prisma.funding.aggregate({ where: { projectId: params.id, deletedAt: null }, _sum: { amount: true } }),
    prisma.funding.aggregate({
      where: { projectId: params.id, deletedAt: null, receivedAt: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    prisma.funding.groupBy({
      by: ['source'],
      where: { projectId: params.id, deletedAt: null },
      _sum: { amount: true },
    }),
  ]);

  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const plannedByCat = new Map(budgets.map((b) => [b.categoryId, Number(b.plannedAmount)]));
  const actualByCat = new Map(grouped.map((g) => [g.categoryId, Number(g._sum.amount ?? 0)]));

  const categoryIds = new Set([...plannedByCat.keys(), ...actualByCat.keys()]);
  const byCategory = [...categoryIds].map((id) => {
    const planned = plannedByCat.get(id) ?? 0;
    const actual = actualByCat.get(id) ?? 0;
    return { categoryId: id, name: nameById.get(id) ?? 'Unknown', ...computeVariance(planned, actual) };
  });

  const totalPlanned = budgets.reduce((s, b) => s + Number(b.plannedAmount), 0);
  const periodActual = Number(periodAgg._sum.amount ?? 0);
  const totalSpend = Number(totalAgg._sum.amount ?? 0);
  const totalFunding = Number(fundingAgg._sum.amount ?? 0);
  const periodFunding = Number(periodFundingAgg._sum.amount ?? 0);
  const bySource = fundingGrouped
    .map((g) => ({ source: g.source, amount: Number(g._sum.amount ?? 0) }))
    .sort((a, b) => b.amount - a.amount);

  return json({
    periodStart: periodStart.toISOString(),
    totalSpend,
    transactionCount: totalAgg._count,
    totalFunding,
    period: { spend: periodActual, ...computeVariance(totalPlanned, periodActual) },
    // Funding as the available "plan", spend as "actual": balance = funding − spend.
    funding: { received: totalFunding, period: periodFunding, ...computeVariance(totalFunding, totalSpend) },
    bySource,
    byCategory,
    recentTransactions: recentTx.map((t) => ({
      id: t.id,
      date: t.occurredAt,
      amount: t.amount.toString(),
      vendor: t.vendor,
      category: t.category.name,
    })),
    recentDiary: recentDiary.map((d) => ({ id: d.id, date: d.entryDate, title: d.title })),
  });
});
