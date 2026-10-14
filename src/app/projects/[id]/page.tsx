import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export default async function ProjectDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [agg, recent] = await Promise.all([
    prisma.transaction.aggregate({
      where: { projectId: id, deletedAt: null },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.transaction.findMany({
      where: { projectId: id, deletedAt: null },
      orderBy: { occurredAt: 'desc' },
      take: 5,
      select: {
        id: true,
        occurredAt: true,
        amount: true,
        vendor: true,
        category: { select: { name: true } },
      },
    }),
  ]);

  const total = Number(agg._sum.amount ?? 0);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Dashboard</h1>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Total spend</p>
          <p className="mt-1 text-2xl font-semibold">{formatCurrency(total)}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">Transactions</p>
          <p className="mt-1 text-2xl font-semibold">{agg._count}</p>
        </div>
      </div>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium text-slate-700">Recent transactions</h2>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No transactions yet — add your first expense from the Transactions tab.
          </p>
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
    </div>
  );
}
