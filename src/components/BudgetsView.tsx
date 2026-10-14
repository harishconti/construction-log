'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatDate, formatINR } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { Field, MoneyInput, Textarea, Segmented } from '@/components/ui/inputs';
import { StatusBadge, ProgressBar, type BudgetStatus } from '@/components/ui/StatusBadge';
import { Alert } from '@/components/ui/Alert';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';

type Granularity = 'week' | 'month';
type Row = {
  categoryId: string;
  budgetId: string | null;
  name: string;
  type: string;
  isActive?: boolean;
  planned: number;
  actual: number;
  variance: number;
  percentUsed: number | null;
  status: BudgetStatus | null;
};
type Resp = {
  granularity: Granularity;
  periodStart: string;
  periodEnd: string;
  rows: Row[];
  totals: { planned: number; actual: number; variance: number; percentUsed: number | null; status: BudgetStatus | null };
};

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function yyyymm(d: Date) {
  return d.toISOString().slice(0, 7);
}

export function BudgetsView({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const toast = useToast();
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revise, setRevise] = useState<{ open: boolean; row: Row | null }>({ open: false, row: null });

  const period = granularity === 'week' ? isoDate(anchor) : yyyymm(anchor);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<Resp>(
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
    setAnchor((a) => {
      const d = new Date(a);
      if (granularity === 'week') d.setUTCDate(d.getUTCDate() + direction * 7);
      else d.setUTCMonth(d.getUTCMonth() + direction);
      return d;
    });
  }

  const label = data
    ? granularity === 'week'
      ? `Week of ${formatDate(data.periodStart)}`
      : new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(
          new Date(data.periodStart),
        )
    : period;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Budgets</h1>
        <div className="flex items-center gap-2">
          <Segmented
            options={[
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
            value={granularity}
            onChange={(g) => setGranularity(g)}
          />
          <IconButton label="Previous period" onClick={() => step(-1)}>
            <ChevronLeft size={18} />
          </IconButton>
          <span className="min-w-28 text-center text-sm text-ink-2">{label}</span>
          <IconButton label="Next period" onClick={() => step(1)}>
            <ChevronRight size={18} />
          </IconButton>
        </div>
      </div>

      {error && <Alert message={error} onRetry={load} />}

      {loading && !data ? (
        <SkeletonRows rows={4} />
      ) : data ? (
        <>
          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {data.rows.map((r) => (
              <li key={r.categoryId} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {r.name} {r.isActive === false && <span className="text-xs text-ink-3">(inactive)</span>}
                  </span>
                  {r.status && <StatusBadge status={r.status} />}
                </div>
                <p className="num mt-1 text-sm text-ink-2">
                  {formatINR(r.actual)}
                  {r.planned > 0 ? ` of ${formatINR(r.planned)}` : ' · no budget'}
                </p>
                {r.planned > 0 && (
                  <div className="mt-2">
                    <ProgressBar percent={r.percentUsed ?? 0} status={r.status ?? 'green'} label={`${r.name} budget used`} />
                  </div>
                )}
                {canEdit && (
                  <Button variant="secondary" className="mt-3 w-full" onClick={() => setRevise({ open: true, row: r })}>
                    {r.budgetId ? 'Revise' : 'Set budget'}
                  </Button>
                )}
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-ink-3">
                <tr>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2 text-right">Planned</th>
                  <th className="px-3 py-2 text-right">Actual</th>
                  <th className="px-3 py-2 text-right">Variance</th>
                  <th className="px-3 py-2">Used</th>
                  {canEdit && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.categoryId} className="border-b border-border/60">
                    <td className="px-3 py-2">
                      {r.name} {r.isActive === false && <span className="text-xs text-ink-3">(inactive)</span>}
                    </td>
                    <td className="num px-3 py-2 text-right">{formatINR(r.planned)}</td>
                    <td className="num px-3 py-2 text-right">{formatINR(r.actual)}</td>
                    <td className={`num px-3 py-2 text-right ${r.variance < 0 ? 'text-danger' : ''}`}>
                      {formatINR(r.variance)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {r.status && <StatusBadge status={r.status} />}
                        {r.planned > 0 && (
                          <div className="w-24">
                            <ProgressBar percent={r.percentUsed ?? 0} status={r.status ?? 'green'} label={`${r.name} budget used`} />
                          </div>
                        )}
                      </div>
                    </td>
                    {canEdit && (
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setRevise({ open: true, row: r })}
                          aria-label={`${r.budgetId ? 'Revise' : 'Set'} ${r.name} budget`}
                          className="inline-flex min-h-11 items-center rounded-md px-2 text-primary hover:underline"
                        >
                          {r.budgetId ? 'Revise' : 'Set'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="num px-3 py-2 text-right">{formatINR(data.totals.planned)}</td>
                  <td className="num px-3 py-2 text-right">{formatINR(data.totals.actual)}</td>
                  <td className={`num px-3 py-2 text-right ${data.totals.variance < 0 ? 'text-danger' : ''}`}>
                    {formatINR(data.totals.variance)}
                  </td>
                  <td className="px-3 py-2">{data.totals.status && <StatusBadge status={data.totals.status} />}</td>
                  {canEdit && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : null}

      {revise.open && revise.row && (
        <ReviseSheet
          projectId={projectId}
          granularity={granularity}
          periodStart={data?.periodStart ?? ''}
          row={revise.row}
          onClose={() => setRevise({ open: false, row: null })}
          onSaved={() => {
            toast.notify('Budget saved');
            setRevise({ open: false, row: null });
            void load();
          }}
        />
      )}
    </div>
  );
}

function ReviseSheet({
  projectId,
  granularity,
  periodStart,
  row,
  onClose,
  onSaved,
}: {
  projectId: string;
  granularity: Granularity;
  periodStart: string;
  row: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(row.planned ? String(row.planned) : '');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const plannedAmount = Number(amount);
      if (row.budgetId) {
        await api.patch(`/api/projects/${projectId}/budgets/${row.budgetId}`, {
          plannedAmount,
          reason: reason || null,
        });
      } else {
        await api.post(`/api/projects/${projectId}/budgets`, {
          categoryId: row.categoryId,
          periodType: granularity,
          periodStart,
          plannedAmount,
          note: reason || null,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${row.budgetId ? 'Revise' : 'Set'} budget · ${row.name}`}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="budget-form" className="flex-1" loading={pending}>
            Save
          </Button>
        </div>
      }
    >
      <form id="budget-form" onSubmit={submit} className="space-y-3">
        <Field label="Planned amount">
          <MoneyInput value={amount} onValueChange={setAmount} placeholder="0" autoFocus />
        </Field>
        <Field label="Reason" hint="Optional note for the revision">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </Field>
        {error && <Alert message={error} />}
      </form>
    </Sheet>
  );
}
