import Link from 'next/link';
import { DashboardChart, type ChartDatum } from '@/components/DashboardChart';
import { StatusBadge, ProgressBar, type BudgetStatus } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { computeVariance } from '@/lib/budget';
import { formatDate, formatINR } from '@/lib/format';
import { periodRange, startOfMonthIST } from '@/lib/period';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function ProjectDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const periodStart = startOfMonthIST(new Date());
  const { start, end } = periodRange('month', periodStart);

  const [project, totalAgg, periodAgg, grouped, budgets, categories, recent, recentDiary] = await Promise.all([
    prisma.project.findUnique({ where: { id }, select: { name: true, startDate: true } }),
    prisma.transaction.aggregate({ where: { projectId: id, deletedAt: null }, _sum: { amount: true }, _count: true }),
    prisma.transaction.aggregate({
      where: { projectId: id, deletedAt: null, occurredAt: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { projectId: id, deletedAt: null, occurredAt: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    prisma.budget.findMany({ where: { projectId: id, periodType: 'month', periodStart } }),
    prisma.category.findMany({ where: { projectId: id }, select: { id: true, name: true } }),
    prisma.transaction.findMany({
      where: { projectId: id, deletedAt: null },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: 5,
      select: { id: true, occurredAt: true, amount: true, vendor: true, category: { select: { name: true } } },
    }),
    prisma.diaryEntry.findMany({
      where: { projectId: id },
      orderBy: { entryDate: 'desc' },
      take: 3,
      select: { id: true, entryDate: true, title: true },
    }),
  ]);

  const total = Number(totalAgg._sum.amount ?? 0);
  const periodSpend = Number(periodAgg._sum.amount ?? 0);
  const totalPlanned = budgets.reduce((s, b) => s + Number(b.plannedAmount), 0);
  const variance = computeVariance(totalPlanned, periodSpend);

  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const rows = [...new Set([...budgets.map((b) => b.categoryId), ...grouped.map((g) => g.categoryId)])]
    .map((cid) => {
      const planned = Number(budgets.find((b) => b.categoryId === cid)?.plannedAmount ?? 0);
      const actual = Number(grouped.find((g) => g.categoryId === cid)?._sum.amount ?? 0);
      return { name: nameById.get(cid) ?? 'Unknown', ...computeVariance(planned, actual) };
    })
    .sort((a, b) => b.actual - a.actual);

  const chart: ChartDatum[] = rows.map((r) => ({ name: r.name, planned: r.planned, actual: r.actual }));
  const usedStatus = variance.status ?? 'green';

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Dashboard</h1>

      {/* Hero: budget used */}
      <section className="rounded-lg bg-ink p-5 text-bg shadow-e1">
        <p className="text-sm opacity-80">Budget used this month</p>
        <p className="num mt-1 font-display text-4xl font-bold">
          {variance.percentUsed === null ? '—' : `${Math.round(variance.percentUsed)}%`}
        </p>
        {variance.percentUsed !== null && (
          <>
            <div className="mt-3">
              <ProgressBar percent={variance.percentUsed} status={usedStatus} />
            </div>
            <p className="num mt-2 text-sm opacity-80">
              {formatINR(periodSpend)} of {formatINR(totalPlanned)} · {formatINR(Math.abs(variance.variance))}{' '}
              {variance.variance >= 0 ? 'left' : 'over'}
            </p>
          </>
        )}
        {variance.percentUsed === null && (
          <p className="mt-2 text-sm opacity-80">No budget set for this month yet.</p>
        )}
      </section>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total spend" value={formatINR(total)} sub={project ? `since ${formatDate(project.startDate)}` : undefined} />
        <Stat label="This month" value={formatINR(periodSpend)} />
        <Stat label="Transactions" value={String(totalAgg._count)} />
        <Stat
          label="Planned (month)"
          value={formatINR(totalPlanned)}
          badge={variance.status ? <StatusBadge status={usedStatus} /> : undefined}
        />
      </div>

      {/* Chart */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="font-display text-lg font-semibold">Planned vs actual</h2>
        <div className="mt-3">
          <DashboardChart data={chart} />
        </div>
      </section>

      {/* Per-category progress rows */}
      {rows.length > 0 && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="font-display text-lg font-semibold">By category</h2>
          <ul className="mt-3 space-y-3">
            {rows.map((r) => (
              <li key={r.name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{r.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="num text-ink-2">
                      {formatINR(r.actual)}
                      {r.planned > 0 ? ` / ${formatINR(r.planned)}` : ''}
                    </span>
                    {r.status && <StatusBadge status={r.status as BudgetStatus} />}
                  </span>
                </div>
                {r.planned > 0 && (
                  <div className="mt-1">
                    <ProgressBar percent={r.percentUsed ?? 0} status={(r.status ?? 'green') as BudgetStatus} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="font-display text-lg font-semibold">Recent expenses</h2>
          {recent.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No expenses yet." />
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {recent.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/projects/${id}/transactions`} className="min-w-0 truncate text-ink-2 hover:text-ink">
                    {t.category.name}
                    {t.vendor ? ` · ${t.vendor}` : ''}
                  </Link>
                  <span className="num ml-2 shrink-0 font-medium">{formatINR(Number(t.amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="font-display text-lg font-semibold">Recent diary</h2>
          {recentDiary.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No diary entries yet." />
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {recentDiary.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink-3">{formatDate(d.entryDate)}</span>
                  <Link href={`/projects/${id}/diary`} className="ml-2 min-w-0 truncate text-primary hover:underline">
                    {d.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, badge }: { label: string; value: string; sub?: string; badge?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-ink-3">{label}</p>
        {badge}
      </div>
      <p className="num mt-1 font-display text-xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-3">{sub}</p>}
    </div>
  );
}
