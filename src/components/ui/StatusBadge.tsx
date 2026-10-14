'use client';

import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

export type BudgetStatus = 'green' | 'yellow' | 'red';

const MAP: Record<BudgetStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  green: { label: 'On track', cls: 'bg-ok-tint text-ok', Icon: CheckCircle2 },
  yellow: { label: 'Near limit', cls: 'bg-warn-tint text-warn', Icon: AlertTriangle },
  red: { label: 'Over', cls: 'bg-danger-tint text-danger', Icon: XCircle },
};

export function StatusBadge({ status }: { status: BudgetStatus }) {
  const { label, cls, Icon } = MAP[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      <Icon size={13} aria-hidden />
      {label}
    </span>
  );
}

export function ProgressBar({ percent, status }: { percent: number; status: BudgetStatus }) {
  const width = Math.min(100, Math.max(0, percent));
  const color = status === 'red' ? 'var(--danger)' : status === 'yellow' ? 'var(--warn)' : 'var(--ok)';
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
    </div>
  );
}
