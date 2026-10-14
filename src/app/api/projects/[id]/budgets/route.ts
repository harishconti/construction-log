import { ApiError, handle, json, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/requireRole';
import { writeAudit } from '@/lib/audit';
import { computeVariance } from '@/lib/budget';
import {
  normalizePeriodStart,
  parsePeriodParam,
  periodRange,
  startOfMonthIST,
  startOfWeekIST,
  type Granularity,
} from '@/lib/period';
import { createBudgetSchema } from '@/lib/validation/schemas';

type Ctx = { params: Promise<{ id: string }> };

function parseGranularity(raw: string | null): Granularity {
  return raw === 'week' ? 'week' : 'month';
}

export const GET = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const user = await requireUser();
  await requireRole(params.id, user.id, 'viewer');

  const url = new URL(req.url);
  const granularity = parseGranularity(url.searchParams.get('granularity'));
  const periodParam = url.searchParams.get('period');

  const now = new Date();
  const defaultStart = granularity === 'week' ? startOfWeekIST(now) : startOfMonthIST(now);
  const periodStart = periodParam ? parsePeriodParam(granularity, periodParam) : defaultStart;
  if (!periodStart) throw ApiError.badRequest('Invalid period parameter', 'INVALID_PERIOD');

  const { start, end } = periodRange(granularity, periodStart);

  const [categories, budgets, grouped, agg] = await Promise.all([
    prisma.category.findMany({
      where: { projectId: params.id, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, type: true },
    }),
    prisma.budget.findMany({
      where: { projectId: params.id, periodType: granularity, periodStart },
    }),
    prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { projectId: params.id, deletedAt: null, occurredAt: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { projectId: params.id, deletedAt: null, occurredAt: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
  ]);

  const plannedByCat = new Map(budgets.map((b) => [b.categoryId, Number(b.plannedAmount)]));
  const budgetIdByCat = new Map(budgets.map((b) => [b.categoryId, b.id]));
  const actualByCat = new Map(grouped.map((g) => [g.categoryId, Number(g._sum.amount ?? 0)]));

  const rows = categories.map((c) => {
    const planned = plannedByCat.get(c.id) ?? 0;
    const actual = actualByCat.get(c.id) ?? 0;
    return {
      categoryId: c.id,
      budgetId: budgetIdByCat.get(c.id) ?? null,
      name: c.name,
      type: c.type,
      ...computeVariance(planned, actual),
    };
  });

  const totalPlanned = rows.reduce((s, r) => s + r.planned, 0);
  const totalActual = Number(agg._sum.amount ?? 0);

  return json({
    granularity,
    periodStart: periodStart.toISOString(),
    periodEnd: end.toISOString(),
    rows,
    totals: computeVariance(totalPlanned, totalActual),
  });
});

export const POST = handle<Ctx>(async (req, { params: paramsPromise }) => {
  const params = await paramsPromise;
  const user = await requireUser();
  await requireRole(params.id, user.id, 'admin');
  const body = await parseJson(req, createBudgetSchema);

  // Accept any date and normalize to the aligned period start (Monday / 1st, IST).
  const periodStart = normalizePeriodStart(body.periodType, body.periodStart);

  const category = await prisma.category.findUnique({ where: { id: body.categoryId } });
  if (!category || category.projectId !== params.id) {
    throw ApiError.badRequest('Category does not belong to this project', 'INVALID_CATEGORY');
  }

  const existing = await prisma.budget.findUnique({
    where: {
      projectId_categoryId_periodType_periodStart: {
        projectId: params.id,
        categoryId: body.categoryId,
        periodType: body.periodType,
        periodStart,
      },
    },
  });

  const budget = await prisma.$transaction(async (tx) => {
    if (!existing) {
      const created = await tx.budget.create({
        data: {
          projectId: params.id,
          categoryId: body.categoryId,
          periodType: body.periodType,
          periodStart,
          plannedAmount: body.plannedAmount,
          note: body.note ?? null,
          createdBy: user.id,
        },
      });
      await writeAudit(tx, { entity: 'budget', entityId: created.id, action: 'create', actorId: user.id, after: created });
      return created;
    }

    const updated = await tx.budget.update({
      where: { id: existing.id },
      data: {
        plannedAmount: body.plannedAmount,
        note: body.note ?? existing.note,
        version: { increment: 1 },
      },
    });
    if (Number(existing.plannedAmount) !== body.plannedAmount) {
      await tx.budgetRevision.create({
        data: {
          budgetId: existing.id,
          oldAmount: existing.plannedAmount,
          newAmount: body.plannedAmount,
          reason: body.note ?? 'upsert',
          changedBy: user.id,
        },
      });
    }
    await writeAudit(tx, { entity: 'budget', entityId: updated.id, action: 'update', actorId: user.id, before: existing, after: updated });
    return updated;
  });

  return json({ budget }, 201);
});
