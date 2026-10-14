'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatINR } from '@/lib/format';

export type ChartDatum = { name: string; planned: number; actual: number };

/** Horizontal planned-vs-actual bars so category names stay readable on phones. */
export function DashboardChart({ data }: { data: ChartDatum[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-ink-3">No category budgets or spend this month yet.</p>;
  }
  const height = Math.max(160, data.length * 52);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 8 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(value) => formatINR(Number(value), { compact: true })} />
          <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value) => formatINR(Number(value))} />
          <Legend />
          <Bar dataKey="planned" name="Planned" fill="var(--primary-tint)" stroke="var(--primary)" radius={[0, 4, 4, 0]} />
          <Bar dataKey="actual" name="Actual" fill="var(--primary)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
