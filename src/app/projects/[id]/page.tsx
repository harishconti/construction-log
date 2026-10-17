import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { DashboardChart, type ChartDatum } from '@/components/DashboardChart';
import { StatusBadge, ProgressBar, type BudgetStatus } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { FundingIcon } from '@/components/FundingIcon';
import { computeVariance } from '@/lib/budget';
import { FUNDING_SOURCE_LABEL } from '@/lib/funding';
import { formatCoords, formatDate, formatDayLabel, formatINR, mapUrl } from '@/lib/format';
import { periodRange, startOfMonthIST } from '@/lib/period';
import { listStages } from '@/lib/queries';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function ProjectDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const periodStart = startOfMonthIST(new Date());
  const { start, end } = periodRange('month', periodStart);

  const [project, totalAgg, periodAgg, grouped, budgets, categories, recent, recentDiary, fundingAgg, periodFundingAgg, fundingGrouped, stages] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      select: { name: true, startDate: true, totalBudget: true, locationName: true, latitude: true, longitude: true },
    }),
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
    prisma.funding.aggregate({ where: { projectId: id, deletedAt: null }, _sum: { amount: true } }),
    prisma.funding.aggregate({
      where: { projectId: id, deletedAt: null, receivedAt: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    prisma.funding.groupBy({
      by: ['source'],
      where: { projectId: id, deletedAt: null },
      _sum: { amount: true },
    }),
    listStages(id),
  ]);

  const total = Number(totalAgg._sum.amount ?? 0);
  const periodSpend = Number(periodAgg._sum.amount ?? 0);
  const totalPlanned = budgets.reduce((s, b) => s + Number(b.plannedAmount), 0);
  const variance = computeVariance(totalPlanned, periodSpend);

  const totalFunding = Number(fundingAgg._sum.amount ?? 0);
  const periodFunding = Number(periodFundingAgg._sum.amount ?? 0);
  // Treat funding as the available "plan" and spend as "actual": balance = funding − spend.
  const fundingVariance = computeVariance(totalFunding, total);
  const fundingRows = fundingGrouped
    .map((g) => ({ source: g.source, amount: Number(g._sum.amount ?? 0) }))
    .sort((a, b) => b.amount - a.amount);

  const estimate = project?.totalBudget ? Number(project.totalBudget) : null;
  const estimateVariance = estimate === null ? null : computeVariance(estimate, total);
  const stagesWithSpend = stages.filter((s) => s.planned > 0 || s.actual > 0);

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
      <header>
        <h1 className="font-display text-2xl font-bold">Dashboard</h1>
        {project && (project.locationName || (project.latitude !== null && project.longitude !== null)) && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-ink-3">
            <MapPin size={14} aria-hidden className="shrink-0" />
            {project.locationName && <span>{project.locationName}</span>}
            {project.latitude !== null && project.longitude !== null && (
              <a
                href={mapUrl(project.latitude, project.longitude)}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                {formatCoords(project.latitude, project.longitude)}
              </a>
            )}
          </p>
        )}
      </header>

      {/* Hero: budget used */}
      <section className="rounded-lg bg-ink p-5 text-bg shadow-e1">
        <p className="text-sm opacity-80">Budget used this month</p>
        <p className="num mt-1 font-display text-4xl font-bold">
          {variance.percentUsed === null ? '—' : `${Math.round(variance.percentUsed)}%`}
        </p>
        {variance.percentUsed !== null && (
          <>
            <div className="mt-3">
              <ProgressBar percent={variance.percentUsed} status={usedStatus} label="Budget used this month" />
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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Total spend" value={formatINR(total)} sub={project ? `since ${formatDate(project.startDate)}` : undefined} />
        <Stat label="This month" value={formatINR(periodSpend)} />
        <Stat label="Transactions" value={String(totalAgg._count)} />
        <Stat label="Funding received" value={formatINR(totalFunding)} />
        <Stat
          label="Balance"
          value={formatINR(fundingVariance.variance)}
          sub={totalFunding > 0 ? 'funding − spend' : undefined}
        />
        <Stat
          label="Planned (month)"
          value={formatINR(totalPlanned)}
          badge={variance.status ? <StatusBadge status={usedStatus} /> : undefined}
        />
        {estimate !== null && (
          <Stat
            label="Estimate"
            value={formatINR(estimate)}
            sub="total project budget"
            badge={estimateVariance?.status ? <StatusBadge status={estimateVariance.status} /> : undefined}
          />
        )}
      </div>

      {/* Funding vs expenditure */}
      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Funding vs expenditure</h2>
          <Link href={`/projects/${id}/funding`} className="text-sm text-primary hover:underline">
            Funding
          </Link>
        </div>
        {fundingRows.length > 0 && (
          <ul className="mt-3 divide-y divide-border">
            {fundingRows.map((r) => (
              <li key={r.source} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-ok-tint text-ok">
                  <FundingIcon source={r.source} size={16} />
                </span>
                <span className="flex-1">{FUNDING_SOURCE_LABEL[r.source as keyof typeof FUNDING_SOURCE_LABEL] ?? r.source}</span>
                <span className="num shrink-0 font-medium">{formatINR(r.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        {fundingVariance.percentUsed !== null ? (
          <div className="mt-3 border-t border-border pt-3">
            <ProgressBar
              percent={fundingVariance.percentUsed}
              status={(fundingVariance.status ?? 'green') as BudgetStatus}
              label="Share of funding used"
            />
            <p className="num mt-1 text-xs text-ink-3">
              {Math.round(fundingVariance.percentUsed)}% of {formatINR(totalFunding)} used · received this month{' '}
              {formatINR(periodFunding)}
            </p>
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState
              title="No funding recorded yet."
              action={
                <Link
                  href={`/projects/${id}/funding`}
                  className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
                >
                  Record funding received
                </Link>
              }
            />
          </div>
        )}
      </section>

      {/* Chart: md+ only; phones get the progress rows below */}
      <section className="hidden rounded-lg border border-border bg-surface p-4 md:block">
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
                    <ProgressBar
                      percent={r.percentUsed ?? 0}
                      status={(r.status ?? 'green') as BudgetStatus}
                      label={`${r.name} budget used`}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Per-stage progress rows */}
      {stagesWithSpend.length > 0 && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">By stage</h2>
            <Link href={`/projects/${id}/stages`} className="text-sm text-primary hover:underline">
              Stages
            </Link>
          </div>
          <ul className="mt-3 space-y-3">
            {stagesWithSpend.map((s) => (
              <li key={s.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{s.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="num text-ink-2">
                      {formatINR(s.actual)}
                      {s.planned > 0 ? ` / ${formatINR(s.planned)}` : ''}
                    </span>
                    {s.status && <StatusBadge status={s.status as BudgetStatus} />}
                  </span>
                </div>
                {s.planned > 0 && (
                  <div className="mt-1">
                    <ProgressBar
                      percent={s.percentUsed ?? 0}
                      status={(s.status ?? 'green') as BudgetStatus}
                      label={`${s.name} budget used`}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="min-w-0 rounded-lg border border-border bg-surface p-4">
          <h2 className="font-display text-lg font-semibold">Recent expenses</h2>
          {recent.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No expenses yet." />
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {recent.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/projects/${id}/transactions#tx-${t.id}`}
                    className="-mx-2 flex min-h-11 items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{t.vendor || t.category.name}</span>
                      <span className="block truncate text-xs text-ink-3">
                        {formatDayLabel(t.occurredAt)}
                        {t.vendor ? ` · ${t.category.name}` : ''}
                      </span>
                    </span>
                    <span className="num shrink-0 font-semibold">{formatINR(Number(t.amount))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="min-w-0 rounded-lg border border-border bg-surface p-4">
          <h2 className="font-display text-lg font-semibold">Recent diary</h2>
          {recentDiary.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No diary entries yet." />
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {recentDiary.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/projects/${id}/diary#entry-${d.id}`}
                    className="-mx-2 flex min-h-11 items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{d.title}</span>
                    <span className="shrink-0 text-xs text-ink-3">{formatDayLabel(d.entryDate)}</span>
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
