'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, ChevronDown, Receipt, X } from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatDayLabel, formatINR } from '@/lib/format';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { DateInput, Field } from '@/components/ui/inputs';
import { istDateToInstant, istDayEnd } from '@/lib/period';

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

type TimelineResponse = { items: Item[]; nextCursor: string | null; hasMore: boolean };

const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank: 'Bank transfer',
  card: 'Card',
  credit: 'Credit',
};

/** IST calendar day, used to group items. */
function dayKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso));
}

export function TimelineView({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const qs = new URLSearchParams({ limit: '25' });
      if (cursor) qs.set('before', cursor);
      if (from) qs.set('from', istDateToInstant(from).toISOString());
      if (to) qs.set('to', istDayEnd(to).toISOString());
      return api.get<TimelineResponse>(`/api/projects/${projectId}/timeline?${qs.toString()}`);
    },
    [projectId, from, to],
  );

  const loadFirst = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPage(null);
      setItems(res.items);
      setNextCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFirst();
  }, [loadFirst]);

  const groups = useMemo(() => {
    const out: { key: string; label: string; spend: number; items: Item[] }[] = [];
    for (const it of items) {
      const key = dayKey(it.date);
      let g = out.find((x) => x.key === key);
      if (!g) {
        g = { key, label: formatDayLabel(it.date), spend: 0, items: [] };
        out.push(g);
      }
      g.items.push(it);
      if (it.type === 'transaction') g.spend += Number(it.amount);
    }
    return out;
  }, [items]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPage(nextCursor);
      setItems((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more');
    } finally {
      setLoading(false);
    }
  }

  const base = `/projects/${projectId}`;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold lg:text-[28px]">Timeline</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-[calc(50%-6px)] sm:w-44">
          <Field label="From">
            <DateInput value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </Field>
        </div>
        <div className="w-[calc(50%-6px)] sm:w-44">
          <Field label="To">
            <DateInput value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        {(from || to) && (
          <Button
            variant="ghost"
            onClick={() => {
              setFrom('');
              setTo('');
            }}
          >
            <X size={16} aria-hidden /> Clear dates
          </Button>
        )}
      </div>

      {error && <Alert message={error} onRetry={items.length ? loadMore : loadFirst} />}

      {loading && items.length === 0 ? (
        <SkeletonRows leading trailing label="Loading timeline" />
      ) : items.length === 0 ? (
        <EmptyState title={from || to ? 'Nothing in this date range.' : 'Nothing here yet — expenses and diary entries will show up here.'} />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`tl-${g.key}`}>
              <header className="flex items-center justify-between px-1 py-1.5 text-xs text-ink-2">
                <h2 id={`tl-${g.key}`} className="font-semibold">
                  {g.label}
                </h2>
                {g.spend > 0 && <span className="num">{formatINR(g.spend)}</span>}
              </header>
              <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                {g.items.map((it) => (
                  <li key={`${it.type}-${it.id}`}>
                    {it.type === 'transaction' ? (
                      <Link href={`${base}/transactions#tx-${it.id}`} className="flex items-center gap-3 p-3 text-sm hover:bg-surface-2">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-primary-tint text-primary">
                          <Receipt size={20} aria-hidden />
                          <span className="sr-only">Expense</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{it.vendor || it.category.name}</span>
                          <span className="block truncate text-ink-2">
                            {[it.vendor ? it.category.name : null, PAYMENT_LABEL[it.paymentMode] ?? it.paymentMode, it.description]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                        <span className="num shrink-0 text-right font-semibold">{formatINR(it.amount)}</span>
                      </Link>
                    ) : (
                      <Link href={`${base}/diary#entry-${it.id}`} className="flex items-start gap-3 p-3 text-sm hover:bg-surface-2">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-warn-tint text-warn">
                          <BookOpen size={20} aria-hidden />
                          <span className="sr-only">Diary entry</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{it.title}</span>
                          {it.body && <span className="line-clamp-2 block whitespace-pre-wrap text-ink-2">{it.body}</span>}
                        </span>
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={loadMore} loading={loading && items.length > 0}>
            {!(loading && items.length > 0) && <ChevronDown size={16} aria-hidden />} Load more
          </Button>
        </div>
      )}
    </div>
  );
}
