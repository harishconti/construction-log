import Link from 'next/link';
import { DashboardChart, type ChartDatum } from '@/components/DashboardChart';
import { computeVariance } from '@/lib/budget';
import { periodRange, startOfMonthIST } from '@/lib/period';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export default async function ProjectDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const periodStart = startOfMonthIST(new Date());
  const { start, end } = periodRange('month', periodStart);

  const [totalAgg, periodAgg, grouped, budgets, categories, recent, recentDiary] = await Promise.all([
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
    prisma.category.findMany({ where: { projectId: id, isActive: true }, select: { id: true, name: true } }),
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
  const plannedByCat = new Map(budgets.map((b) => [b.categoryId, Number(b.plannedAmount)]));
  const actualByCat = new Map(grouped.map((g) => [g.categoryId, Number(g._sum.amount ?? 0)]));
  const chart: ChartDatum[] = [...new Set([...plannedByCat.keys(), ...actualByCat.keys()])].map((cid) => ({
    name: nameById.get(cid) ?? 'Unknown',
    planned: plannedByCat.get(cid) ?? 0,
    actual: actualByCat.get(cid) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Dashboard</h1>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Total spend</p>
          <p className="mt-1 text-2xl font-semibold">{formatCurrency(total)}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">This month</p>
          <p className="mt-1 text-2xl font-semibold">{formatCurrency(periodSpend)}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Budget used</p>
          <p className="mt-1 text-2xl font-semibold">
            {variance.percentUsed === null ? '—' : `${Math.round(variance.percentUsed)}%`}
          </p>
        </div>
      </div>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium text-slate-700">Planned vs actual (this month)</h2>
        <div className="mt-3">
          <DashboardChart data={chart} />
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="text-sm font-medium text-slate-700">Recent transactions</h2>
          {recent.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No transactions yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {recent.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-600">
                    {new Date(t.occurredAt).toLocaleDateString()} · {t.category.name}
                    {t.vendor ? ` · ${t.vendor}` : ''}
                  </span>
                  <span className="font-medium">{formatCurrency(Number(t.amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="text-sm font-medium text-slate-700">Recent diary</h2>
          {recentDiary.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No diary entries yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {recentDiary.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-600">{new Date(d.entryDate).toLocaleDateString()}</span>
                  <Link href={`/projects/${id}/diary`} className="text-primary hover:underline">
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
