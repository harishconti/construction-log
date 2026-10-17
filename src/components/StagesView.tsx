'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatDate, formatINR } from '@/lib/format';
import { istDateToInstant, todayIST } from '@/lib/period';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Sheet } from '@/components/ui/Sheet';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { ProgressBar, StatusBadge, type BudgetStatus } from '@/components/ui/StatusBadge';
import { RowMenu } from '@/components/ui/RowMenu';
import { useToast } from '@/components/ui/Toast';
import { DateInput, Field, MoneyInput, TextInput } from '@/components/ui/inputs';

type Stage = {
  id: string;
  name: string;
  plannedAmount: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  order: number;
  version: number;
  actual: number;
  transactionCount: number;
  planned: number;
  variance: number;
  percentUsed: number | null;
  status: BudgetStatus | null;
};

export function StagesView({
  projectId,
  role,
  initial,
}: {
  projectId: string;
  role: string;
  initial?: { stages: Stage[] };
}) {
  const toast = useToast();
  const [stages, setStages] = useState<Stage[]>(initial?.stages ?? []);
  const [loading, setLoading] = useState(!initial);
  const usedInitial = useRef(Boolean(initial));
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; stage: Stage | null }>({ open: false, stage: null });
  const [confirm, setConfirm] = useState<{ open: boolean; stage: Stage | null }>({ open: false, stage: null });

  const isAdmin = role === 'admin';
  const canEdit = role === 'admin' || role === 'editor';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ stages: Stage[] }>(`/api/projects/${projectId}/stages`);
      setStages(res.stages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stages');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (usedInitial.current) {
      usedInitial.current = false;
      return;
    }
    void load();
  }, [load]);

  async function removeStage(s: Stage) {
    setConfirm({ open: false, stage: null });
    setError(null);
    try {
      await api.delete(`/api/projects/${projectId}/stages/${s.id}`);
      toast.notify('Stage deleted');
      void load();
    } catch (err) {
      toast.notify(err instanceof Error ? err.message : 'Failed to delete stage', 'error');
    }
  }

  const totalPlanned = stages.reduce((sum, s) => sum + (s.plannedAmount ? Number(s.plannedAmount) : 0), 0);
  const totalActual = stages.reduce((sum, s) => sum + s.actual, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h1 className="font-display text-2xl font-bold lg:text-[28px]">Stages</h1>
          <span className="num text-sm text-ink-3">{stages.length}</span>
        </div>
        {canEdit && (
          <Button onClick={() => setSheet({ open: true, stage: null })}>
            <Plus size={16} aria-hidden /> Add stage
          </Button>
        )}
      </div>

      {stages.length > 0 && (
        <p className="text-sm text-ink-2">
          Planned <span className="num font-semibold">{formatINR(totalPlanned)}</span> · spent{' '}
          <span className="num font-semibold">{formatINR(totalActual)}</span> across {stages.length}{' '}
          {stages.length === 1 ? 'stage' : 'stages'}.
        </p>
      )}

      {error && <Alert message={error} onRetry={load} />}

      {loading && stages.length === 0 ? (
        <SkeletonRows leading trailing label="Loading stages" />
      ) : stages.length === 0 ? (
        <EmptyState
          title="No stages yet — split the build into phases (foundation, slab, finishing) to track spend per stage."
          action={
            canEdit ? (
              <Button onClick={() => setSheet({ open: true, stage: null })}>
                <Plus size={16} aria-hidden /> Add your first stage
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {stages.map((s) => (
            <li key={s.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-primary-tint text-primary">
                  <Layers size={20} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => canEdit && setSheet({ open: true, stage: s })}
                      className={`truncate text-left font-medium ${canEdit ? 'hover:underline' : ''}`}
                    >
                      {s.name}
                    </button>
                    {s.status && <StatusBadge status={s.status} />}
                  </div>
                  <div className="num text-sm text-ink-2">
                    {formatINR(s.actual)}
                    {s.planned > 0 ? ` of ${formatINR(s.planned)}` : ''}
                    {s.plannedStart || s.plannedEnd
                      ? ` · ${s.plannedStart ? formatDate(s.plannedStart) : '—'} → ${s.plannedEnd ? formatDate(s.plannedEnd) : '—'}`
                      : ''}
                  </div>
                  {s.planned > 0 && (
                    <div className="mt-2">
                      <ProgressBar
                        percent={s.percentUsed ?? 0}
                        status={(s.status ?? 'green') as BudgetStatus}
                        label={`${s.name} budget used`}
                      />
                    </div>
                  )}
                </div>
                {canEdit && (
                  <div className="flex w-11 shrink-0 justify-center">
                    <RowMenu
                      label={`Actions for ${s.name}`}
                      items={[
                        { label: 'Edit', icon: <Pencil size={16} aria-hidden />, onSelect: () => setSheet({ open: true, stage: s }) },
                        ...(isAdmin
                          ? [
                              {
                                label: 'Delete',
                                icon: <Trash2 size={16} aria-hidden />,
                                danger: true,
                                onSelect: () => setConfirm({ open: true, stage: s }),
                              },
                            ]
                          : []),
                      ]}
                    />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {sheet.open && (
        <StageSheet
          projectId={projectId}
          stage={sheet.stage}
          onClose={() => setSheet({ open: false, stage: null })}
          onSaved={(msg) => {
            toast.notify(msg);
            setSheet({ open: false, stage: null });
            void load();
          }}
        />
      )}

      <ConfirmDialog
        open={confirm.open}
        title="Delete this stage?"
        message="Expenses tagged to this stage are kept but untagged. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirm.stage && void removeStage(confirm.stage)}
        onCancel={() => setConfirm({ open: false, stage: null })}
      />
    </div>
  );
}

function StageSheet({
  projectId,
  stage,
  onClose,
  onSaved,
}: {
  projectId: string;
  stage: Stage | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState(stage?.name ?? '');
  const [plannedAmount, setPlannedAmount] = useState(stage?.plannedAmount ? Number(stage.plannedAmount).toString() : '');
  const [plannedStart, setPlannedStart] = useState(stage?.plannedStart ? todayIST(new Date(stage.plannedStart)) : '');
  const [plannedEnd, setPlannedEnd] = useState(stage?.plannedEnd ? todayIST(new Date(stage.plannedEnd)) : '');
  const [order, setOrder] = useState(stage ? String(stage.order) : '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const payload = {
      name,
      plannedAmount: plannedAmount === '' ? null : Number(plannedAmount),
      // Bare YYYY-MM-DD is read as an IST calendar date; empty clears the date.
      plannedStart: plannedStart ? istDateToInstant(plannedStart).toISOString() : null,
      plannedEnd: plannedEnd ? istDateToInstant(plannedEnd).toISOString() : null,
      order: order === '' ? 0 : Number(order),
    };
    try {
      if (stage) {
        await api.patch(`/api/projects/${projectId}/stages/${stage.id}`, { ...payload, version: stage.version });
        onSaved('Stage updated');
      } else {
        await api.post(`/api/projects/${projectId}/stages`, payload);
        onSaved('Stage added');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save stage');
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={stage ? 'Edit stage' : 'Add stage'}
      footer={
        <div className="flex flex-1 justify-end gap-2">
          <Button variant="secondary" className="flex-1 md:flex-none" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="stage-form" className="flex-1 md:flex-none" loading={pending}>
            Save
          </Button>
        </div>
      }
    >
      <form id="stage-form" onSubmit={submit} className="space-y-3">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Plinth" autoFocus required />
        </Field>
        <Field label="Planned amount" hint="Optional">
          <MoneyInput value={plannedAmount} onValueChange={setPlannedAmount} placeholder="0" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start">
            <DateInput value={plannedStart} max={plannedEnd || undefined} onChange={(e) => setPlannedStart(e.target.value)} />
          </Field>
          <Field label="End">
            <DateInput value={plannedEnd} min={plannedStart || undefined} onChange={(e) => setPlannedEnd(e.target.value)} />
          </Field>
        </div>
        <Field label="Order" hint="Lower shows first">
          <TextInput
            value={order}
            onChange={(e) => setOrder(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            placeholder="0"
          />
        </Field>
        {stage && (
          <p className="text-sm text-ink-3">
            Spent so far <span className="num font-medium text-ink-2">{formatINR(stage.actual)}</span> across{' '}
            {stage.transactionCount} {stage.transactionCount === 1 ? 'expense' : 'expenses'}.
          </p>
        )}
        {error && <Alert message={error} />}
      </form>
    </Sheet>
  );
}
