'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api-client';

type Item =
  | {
      type: 'transaction';
      id: string;
      date: string;
      amount: string;
      vendor: string | null;
      paymentMode: string;
      description: string | null;
      category: { id: string; name: string };
    }
  | { type: 'diary'; id: string; date: string; title: string; body: string };

type Page = { page: number; limit: number; total: number; pages: number };

export function TimelineView({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [pagination, setPagination] = useState<Page | null>(null);
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: '25' });
      if (from) qs.set('from', new Date(from).toISOString());
      if (to) qs.set('to', new Date(`${to}T23:59:59`).toISOString());
      const res = await api.get<{ items: Item[]; pagination: Page }>(
        `/api/projects/${projectId}/timeline?${qs.toString()}`,
      );
      setItems(res.items);
      setPagination(res.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [projectId, page, from, to]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Timeline</h1>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="block text-slate-700">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setPage(1);
              setFrom(e.target.value);
            }}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="block text-slate-700">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setPage(1);
              setTo(e.target.value);
            }}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </label>
        {(from || to) && (
          <button
            type="button"
            onClick={() => {
              setFrom('');
              setTo('');
              setPage(1);
            }}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            Clear
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Nothing here yet.
        </div>
      ) : (
        <ol className="space-y-2">
          {items.map((it) => (
            <li key={`${it.type}-${it.id}`} className="flex gap-3 rounded-xl bg-white p-3 shadow-sm">
              <div className="w-20 shrink-0 text-xs text-slate-500">
                {new Date(it.date).toLocaleDateString()}
              </div>
              <div className="flex-1 text-sm">
                {it.type === 'transaction' ? (
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{it.category.name}</div>
                      <div className="text-slate-500">
                        {[it.vendor, it.paymentMode].filter(Boolean).join(' · ')}
                      </div>
                      {it.description && <div className="text-slate-500">{it.description}</div>}
                    </div>
                    <div className="font-medium">₹{Number(it.amount).toLocaleString('en-IN')}</div>
                  </div>
                ) : (
                  <div>
                    <div className="font-medium">📝 {it.title}</div>
                    {it.body && <div className="whitespace-pre-wrap text-slate-600">{it.body}</div>}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg px-3 py-1 hover:bg-slate-100 disabled:opacity-40"
          >
            ‹ Prev
          </button>
          <span className="text-slate-500">
            Page {pagination.page} of {pagination.pages}
          </span>
          <button
            type="button"
            disabled={page >= pagination.pages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg px-3 py-1 hover:bg-slate-100 disabled:opacity-40"
          >
            Next ›
          </button>
        </div>
      )}
    </div>
  );
}
