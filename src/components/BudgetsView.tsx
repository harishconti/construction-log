'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api-client';

type Granularity = 'week' | 'month';
type Row = {
  categoryId: string;
  budgetId: string | null;
  name: string;
  type: string;
  planned: number;
  actual: number;
  variance: number;
  percentUsed: number | null;
  status: 'green' | 'yellow' | 'red' | null;
};
type BudgetResponse = {
  granularity: Granularity;
  periodStart: string;
  periodEnd: string;
  rows: Row[];
  totals: { planned: number; actual: number; variance: number; percentUsed: number | null; status: Row['status'] };
};

const STATUS_CLASS: Record<string, string> = {
  green: 'text-green-700',
  yellow: 'text-amber-600',
  red: 'text-red-600',
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function yyyymm(d: Date) {
  return d.toISOString().slice(0, 7);
}

export function BudgetsView({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [data, setData] = useState<BudgetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const period = granularity === 'week' ? isoDate(anchor) : yyyymm(anchor);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<BudgetResponse>(
        `/api/projects/${projectId}/budgets?granularity=${granularity}&period=${period}`,
      );
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [projectId, granularity, period]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function step(direction: -1 | 1) {
    const d = new Date(anchor);
    if (granularity === 'week') d.setUTCDate(d.getUTCDate() + direction * 7);
    else d.setUTCMonth(d.getUTCMonth() + direction);
    setAnchor(d);
  }

  async function revise(row: Row) {
    const current = row.planned;
    const input = window.prompt(`New planned amount for ${row.name}`, String(current));
    if (input === null) return;
    const amount = Number(input);
    if (Number.isNaN(amount) || amount < 0) return;
    const reason = window.prompt('Reason for revision (optional)') ?? null;
    try {
      if (row.budgetId) {
        await api.patch(`/api/projects/${projectId}/budgets/${row.budgetId}`, { plannedAmount: amount, reason });
      } else {
        const periodStart = data?.periodStart;
        if (!periodStart) return;
        await api.post(`/api/projects/${projectId}/budgets`, {
          categoryId: row.categoryId,
          periodType: granularity,
          periodStart,
          plannedAmount: amount,
          note: reason,
        });
      }
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save budget');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Budgets</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
            {(['week', 'month'] as Granularity[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGranularity(g)}
                className={`rounded-md px-3 py-1 ${granularity === g ? 'bg-white shadow-sm' : 'text-slate-500'}`}
              >
                {g === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => step(-1)} className="rounded-lg px-2 py-1 text-sm hover:bg-slate-100">
            ‹
          </button>
          <span className="text-sm text-slate-600">
            {data ? new Date(data.periodStart).toLocaleDateString('en-IN') : period}
          </span>
          <button type="button" onClick={() => step(1)} className="rounded-lg px-2 py-1 text-sm hover:bg-slate-100">
            ›
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : data ? (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2 text-right">Planned</th>
                <th className="px-3 py-2 text-right">Actual</th>
                <th className="px-3 py-2 text-right">Variance</th>
                <th className="px-3 py-2 text-right">% Used</th>
                {canEdit && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.categoryId} className="border-b border-slate-50">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.planned)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.actual)}</td>
                  <td className={`px-3 py-2 text-right ${r.variance < 0 ? 'text-red-600' : ''}`}>{fmt(r.variance)}</td>
                  <td className={`px-3 py-2 text-right ${r.status ? STATUS_CLASS[r.status] : ''}`}>
                    {r.percentUsed === null ? '—' : `${Math.round(r.percentUsed)}%`}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => revise(r)} className="text-primary hover:underline">
                        {r.budgetId ? 'Revise' : 'Set'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-medium">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right">{fmt(data.totals.planned)}</td>
                <td className="px-3 py-2 text-right">{fmt(data.totals.actual)}</td>
                <td className={`px-3 py-2 text-right ${data.totals.variance < 0 ? 'text-red-600' : ''}`}>
                  {fmt(data.totals.variance)}
                </td>
                <td className="px-3 py-2 text-right">
                  {data.totals.percentUsed === null ? '—' : `${Math.round(data.totals.percentUsed)}%`}
                </td>
                {canEdit && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </div>
  );
}
