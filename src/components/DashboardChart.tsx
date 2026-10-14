'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type ChartDatum = { name: string; planned: number; actual: number };

export function DashboardChart({ data }: { data: ChartDatum[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-500">No category budgets or spend this month yet.</p>;
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} width={64} />
          <Tooltip formatter={(v: number) => new Intl.NumberFormat('en-IN').format(v)} />
          <Legend />
          <Bar dataKey="planned" name="Planned" fill="#93c5fd" radius={[4, 4, 0, 0]} />
          <Bar dataKey="actual" name="Actual" fill="#2563eb" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
