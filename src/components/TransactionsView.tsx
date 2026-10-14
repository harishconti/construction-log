'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Pencil, Plus, Receipt, RotateCcw, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { api, newIdempotencyKey } from '@/lib/api-client';
import { istDateToInstant, istDayEnd, todayIST } from '@/lib/period';
import { formatDate, formatDayLabel, formatINR } from '@/lib/format';
import { AttachmentList, isImage, type AttachmentItem } from '@/components/AttachmentList';
import { UploadPicker, useUploads } from '@/components/UploadPicker';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Sheet } from '@/components/ui/Sheet';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton, SkeletonRows } from '@/components/ui/Skeleton';
import { Lightbox } from '@/components/ui/Lightbox';
import { RowMenu } from '@/components/ui/RowMenu';
import { useToast } from '@/components/ui/Toast';
import { DateInput, Field, MoneyInput, Select, Segmented, Textarea, TextInput } from '@/components/ui/inputs';

type Category = { id: string; name: string; type: string };
type Transaction = {
  id: string;
  occurredAt: string;
  amount: string;
  gstAmount: string;
  vendor: string | null;
  paymentMode: string;
  description: string | null;
  version: number;
  deletedAt: string | null;
  category: { id: string; name: string };
  attachments: AttachmentItem[];
};
type Page = { page: number; limit: number; total: number; pages: number };

const PAYMENT_MODES = ['cash', 'upi', 'bank', 'card', 'credit'];
const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank: 'Bank transfer',
  card: 'Card',
  credit: 'Credit',
};
const PAYMENT_OPTIONS = PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_LABEL[m] }));

const SEARCH_DEBOUNCE_MS = 300;

/** First viewable image of a transaction, for the leading thumbnail. */
function firstImage(t: Transaction): AttachmentItem | undefined {
  return t.attachments.find(isImage);
}

export function TransactionsView({ projectId, role }: { projectId: string; role: string }) {
  const toast = useToast();
  const [items, setItems] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pagination, setPagination] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const [sheet, setSheet] = useState<{ open: boolean; entry: Transaction | null }>({ open: false, entry: null });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewer, setViewer] = useState<{ images: AttachmentItem[]; index: number } | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ open: boolean; message: string; run: () => void }>({
    open: false,
    message: '',
    run: () => undefined,
  });

  const [page, setPage] = useState(1);
  const [categoryId, setCategoryId] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [search, setSearch] = useState('');
  const [vendor, setVendor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const isAdmin = role === 'admin';
  const canEdit = role === 'admin' || role === 'editor';

  // Debounce the search box into the `vendor` query param.
  useEffect(() => {
    const term = search.trim();
    if (term === vendor) return;
    const t = setTimeout(() => {
      setPage(1);
      setVendor(term);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search, vendor]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: '25' });
      if (showDeleted) qs.set('includeDeleted', 'true');
      if (categoryId) qs.set('categoryId', categoryId);
      if (paymentMode) qs.set('paymentMode', paymentMode);
      if (vendor) qs.set('vendor', vendor);
      if (from) qs.set('from', istDateToInstant(from).toISOString());
      if (to) qs.set('to', istDayEnd(to).toISOString());

      const [txRes, catRes] = await Promise.all([
        api.get<{ items: Transaction[]; pagination: Page }>(
          `/api/projects/${projectId}/transactions?${qs.toString()}`,
        ),
        api.get<{ categories: Category[] }>(`/api/projects/${projectId}/categories`),
      ]);
      setItems(txRes.items);
      setPagination(txRes.pagination);
      setCategories(catRes.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [projectId, page, showDeleted, categoryId, paymentMode, vendor, from, to]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Deep link from the dashboard: /transactions#tx-<id> scrolls to and highlights the row.
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current || items.length === 0) return;
    const match = window.location.hash.match(/^#tx-(.+)$/);
    if (!match) return;
    linked.current = true;
    const id = decodeURIComponent(match[1]);
    if (!items.some((t) => t.id === id)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHighlight(id);
    requestAnimationFrame(() => {
      const visible = Array.from(document.querySelectorAll<HTMLElement>(`[data-tx="${CSS.escape(id)}"]`)).find(
        (el) => el.offsetParent !== null,
      );
      visible?.scrollIntoView({ block: 'center' });
    });
    const t = setTimeout(() => setHighlight(null), 2500);
    return () => clearTimeout(t);
  }, [items]);

  // Vendor search is shown in its own field, so it isn't counted as a filter chip.
  const activeFilters = useMemo(
    () => [categoryId, paymentMode, from, to].filter(Boolean).length,
    [categoryId, paymentMode, from, to],
  );

  const grouped = useMemo(() => {
    const groups: { key: string; label: string; total: number; rows: Transaction[] }[] = [];
    for (const t of items) {
      const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(t.occurredAt));
      const label = formatDayLabel(t.occurredAt);
      let g = groups.find((x) => x.key === key);
      if (!g) {
        g = { key, label, total: 0, rows: [] };
        groups.push(g);
      }
      g.rows.push(t);
      if (!t.deletedAt) g.total += Number(t.amount);
    }
    return groups;
  }, [items]);

  const visibleTotal = useMemo(
    () => items.reduce((sum, t) => (t.deletedAt ? sum : sum + Number(t.amount)), 0),
    [items],
  );
  const liveCount = items.filter((t) => !t.deletedAt).length;

  function resetFilters() {
    setCategoryId('');
    setPaymentMode('');
    setSearch('');
    setVendor('');
    setFrom('');
    setTo('');
    setPage(1);
  }

  function openEdit(t: Transaction) {
    if (canEdit && !t.deletedAt) setSheet({ open: true, entry: t });
  }

  async function restore(t: Transaction, quiet = false) {
    try {
      await api.post(`/api/projects/${projectId}/transactions/${t.id}/restore`);
      toast.notify('Expense restored');
      void load();
    } catch (err) {
      if (!quiet) toast.notify(err instanceof Error ? err.message : 'Failed to restore', 'error');
      else toast.notify('Could not undo the delete', 'error');
    }
  }

  // Soft delete is reversible, so delete immediately and offer Undo instead of confirming first.
  async function softDelete(t: Transaction) {
    try {
      await api.delete(`/api/projects/${projectId}/transactions/${t.id}`);
      toast.notify('Expense deleted', 'success', { action: { label: 'Undo', onClick: () => void restore(t, true) } });
      void load();
    } catch (err) {
      toast.notify(err instanceof Error ? err.message : 'Failed to delete', 'error');
    }
  }

  function requestDeleteAttachment(id: string) {
    setConfirm({
      open: true,
      message: 'Remove this attachment? This cannot be undone.',
      run: async () => {
        setConfirm((c) => ({ ...c, open: false }));
        try {
          await api.delete(`/api/attachments/${id}`);
          toast.notify('Attachment removed');
          setSheet((s) =>
            s.entry ? { ...s, entry: { ...s.entry, attachments: s.entry.attachments.filter((a) => a.id !== id) } } : s,
          );
          void load();
        } catch (err) {
          toast.notify(err instanceof Error ? err.message : 'Failed to remove', 'error');
        }
      },
    });
  }

  function menuItems(t: Transaction) {
    return [
      { label: 'Edit', icon: <Pencil size={16} aria-hidden />, onSelect: () => openEdit(t) },
      ...(isAdmin
        ? [{ label: 'Delete', icon: <Trash2 size={16} aria-hidden />, danger: true, onSelect: () => void softDelete(t) }]
        : []),
    ];
  }

  function trailingActions(t: Transaction) {
    if (t.deletedAt) {
      return isAdmin ? (
        <IconButton label="Restore" onClick={(e) => { e.stopPropagation(); void restore(t); }}>
          <RotateCcw size={16} />
        </IconButton>
      ) : null;
    }
    return canEdit ? <RowMenu items={menuItems(t)} label={`Actions for ${t.vendor || t.category.name}`} /> : null;
  }

  function billCell(t: Transaction, size: 'sm' | 'md') {
    const img = firstImage(t);
    const box = size === 'md' ? 'h-11 w-11' : 'h-9 w-9';
    if (img) {
      const images = t.attachments.filter(isImage);
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setViewer({ images, index: 0 });
          }}
          aria-label={`View bill for ${t.vendor || t.category.name}`}
          className={`relative ${box} shrink-0 overflow-hidden rounded-sm ring-1 ring-border`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.url} alt="" loading="lazy" className="h-full w-full object-cover" />
          {t.attachments.length > 1 && (
            <span className="num absolute bottom-0 right-0 rounded-tl-sm bg-[#1a1d21] px-1 text-xs font-semibold leading-4 text-white">
              {t.attachments.length}
            </span>
          )}
        </button>
      );
    }
    const file = t.attachments[0];
    if (file) {
      return (
        <a
          href={file.downloadUrl}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Download ${file.originalName ?? 'bill'}`}
          className={`flex ${box} shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink-2 hover:text-ink`}
        >
          <FileText size={18} aria-hidden />
        </a>
      );
    }
    return (
      <span className={`flex ${box} shrink-0 items-center justify-center rounded-sm bg-primary-tint text-primary`} aria-hidden>
        <Receipt size={18} />
      </span>
    );
  }

  const mode = (t: Transaction) => PAYMENT_LABEL[t.paymentMode] ?? t.paymentMode;
  const gstLine = (t: Transaction) => (Number(t.gstAmount) > 0 ? `incl. ${formatINR(t.gstAmount)} GST` : null);
  const title = (t: Transaction) => t.vendor || t.category.name;

  const empty = !loading && items.length === 0;
  const filtered = activeFilters > 0 || Boolean(vendor);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h1 className="font-display text-2xl font-bold lg:text-[28px]">Expenses</h1>
          {pagination && <span className="num text-sm text-ink-3">{pagination.total}</span>}
        </div>
        {canEdit && (
          <Button onClick={() => setSheet({ open: true, entry: null })} className="hidden md:inline-flex">
            <Plus size={16} aria-hidden /> Add expense
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1 md:max-w-sm">
          <label htmlFor="tx-search" className="sr-only">
            Search vendor
          </label>
          <Search size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            id="tx-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendor"
            enterKeyHint="search"
            autoComplete="off"
            className="h-11 w-full rounded-md border border-border-strong bg-surface pl-10 pr-10 text-base text-ink placeholder:text-ink-3 md:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-ink-3 hover:text-ink"
            >
              <X size={16} aria-hidden />
            </button>
          )}
        </div>
        <Button variant="secondary" onClick={() => setFiltersOpen(true)} className="shrink-0">
          <SlidersHorizontal size={16} aria-hidden />
          Filters{activeFilters ? ` · ${activeFilters}` : ''}
        </Button>
      </div>

      {activeFilters > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {categoryId && (
            <FilterChip label={categories.find((c) => c.id === categoryId)?.name ?? 'Category'} onClear={() => { setPage(1); setCategoryId(''); }} />
          )}
          {paymentMode && <FilterChip label={PAYMENT_LABEL[paymentMode] ?? paymentMode} onClear={() => { setPage(1); setPaymentMode(''); }} />}
          {from && <FilterChip label={`From ${formatDate(from)}`} onClear={() => { setPage(1); setFrom(''); }} />}
          {to && <FilterChip label={`To ${formatDate(to)}`} onClear={() => { setPage(1); setTo(''); }} />}
          <button type="button" onClick={resetFilters} className="min-h-11 px-2 text-sm text-ink-2 hover:text-ink">
            Clear all
          </button>
        </div>
      )}

      {error && <Alert message={error} onRetry={load} />}

      {loading && items.length === 0 ? (
        <>
          <div className="md:hidden">
            <SkeletonRows leading trailing label="Loading expenses" />
          </div>
          <TableSkeleton />
        </>
      ) : empty ? (
        <EmptyState
          title={filtered ? 'No expenses match these filters.' : 'No expenses yet — record your first bill.'}
          action={
            filtered ? (
              <Button variant="secondary" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : canEdit ? (
              <Button onClick={() => setSheet({ open: true, entry: null })}>
                <Plus size={16} aria-hidden /> Add your first expense
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Mobile: day-grouped rows */}
          <div className="space-y-4 md:hidden">
            {grouped.map((g) => (
              <section key={g.key} aria-label={g.label}>
                <header
                  className="sticky z-10 flex items-center justify-between bg-bg px-1 py-1.5 text-xs text-ink-2"
                  style={{ top: 'calc(4rem + env(safe-area-inset-top))' }}
                >
                  <span className="font-semibold">{g.label}</span>
                  <span className="num">{formatINR(g.total)}</span>
                </header>
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                  {g.rows.map((t) => (
                    <li
                      key={t.id}
                      data-tx={t.id}
                      onClick={() => openEdit(t)}
                      className={`flex items-center gap-3 py-2 pl-3 pr-1 text-sm transition-colors ${
                        canEdit && !t.deletedAt ? 'cursor-pointer active:bg-surface-2' : ''
                      } ${highlight === t.id ? 'bg-primary-tint' : ''}`}
                    >
                      {billCell(t, 'md')}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {canEdit && !t.deletedAt ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openEdit(t); }}
                              className="truncate text-left font-medium"
                            >
                              {title(t)}
                            </button>
                          ) : (
                            <span className={`truncate font-medium ${t.deletedAt ? 'line-through' : ''}`}>{title(t)}</span>
                          )}
                          {t.deletedAt && <DeletedBadge />}
                        </div>
                        <div className="truncate text-ink-2">
                          {[t.vendor ? t.category.name : null, mode(t), gstLine(t)].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <span className={`num shrink-0 font-semibold ${t.deletedAt ? 'line-through' : ''}`}>{formatINR(t.amount)}</span>
                      <div className="flex w-11 shrink-0 justify-center">{trailingActions(t)}</div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {/* md+: table */}
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs text-ink-2">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Date</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Vendor</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Category</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Paid by</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Bill</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Amount</th>
                  <th scope="col" className="w-14 px-2 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((t) => (
                  <tr
                    key={t.id}
                    data-tx={t.id}
                    onClick={() => openEdit(t)}
                    className={`transition-colors ${canEdit && !t.deletedAt ? 'cursor-pointer hover:bg-surface-2' : ''} ${
                      highlight === t.id ? 'bg-primary-tint' : ''
                    }`}
                  >
                    <td className="num whitespace-nowrap px-4 py-2 text-ink-2">{formatDate(t.occurredAt)}</td>
                    <td className="max-w-[16rem] px-3 py-2">
                      <div className="flex items-center gap-2">
                        {canEdit && !t.deletedAt ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openEdit(t); }}
                            className="truncate text-left font-medium hover:underline"
                          >
                            {t.vendor || '—'}
                          </button>
                        ) : (
                          <span className={`truncate font-medium ${t.deletedAt ? 'line-through' : ''}`}>{t.vendor || '—'}</span>
                        )}
                        {t.deletedAt && <DeletedBadge />}
                      </div>
                      {t.description && <div className="truncate text-xs text-ink-3">{t.description}</div>}
                    </td>
                    <td className="px-3 py-2 text-ink-2">{t.category.name}</td>
                    <td className="px-3 py-2 text-ink-2">{mode(t)}</td>
                    <td className="px-3 py-2">{t.attachments.length > 0 ? billCell(t, 'sm') : <span className="text-ink-3">—</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <div className={`num font-semibold ${t.deletedAt ? 'line-through' : ''}`}>{formatINR(t.amount)}</div>
                      {gstLine(t) && <div className="num text-xs text-ink-3">{gstLine(t)}</div>}
                    </td>
                    <td className="px-2 py-1 text-right">{trailingActions(t)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border bg-surface-2">
                <tr>
                  <th scope="row" colSpan={5} className="px-4 py-3 text-left text-sm font-semibold">
                    Total
                    <span className="ml-2 font-normal text-ink-2">
                      {pagination && pagination.pages > 1
                        ? `${liveCount} on this page of ${pagination.total}`
                        : `${liveCount} ${liveCount === 1 ? 'expense' : 'expenses'}`}
                      {filtered ? ' · filtered' : ''}
                    </span>
                  </th>
                  <td className="num px-3 py-3 text-right font-semibold">{formatINR(visibleTotal)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ‹ Prev
          </Button>
          <span className="num text-ink-2">
            {pagination.page} / {pagination.pages}
          </span>
          <Button variant="secondary" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>
            Next ›
          </Button>
        </div>
      )}

      {/* Mobile FAB */}
      {canEdit && (
        <button
          type="button"
          aria-label="Add expense"
          onClick={() => setSheet({ open: true, entry: null })}
          className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-e2 md:hidden"
          style={{ bottom: 'calc(var(--bottom-nav-h) + 16px)' }}
        >
          <Plus size={26} aria-hidden />
        </button>
      )}

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={resetFilters}>
              Clear
            </Button>
            <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
              Done
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field label="Category">
            <Select value={categoryId} onChange={(e) => { setPage(1); setCategoryId(e.target.value); }}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Payment mode">
            <Select value={paymentMode} onChange={(e) => { setPage(1); setPaymentMode(e.target.value); }}>
              <option value="">All modes</option>
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_LABEL[m]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <DateInput value={from} max={to || undefined} onChange={(e) => { setPage(1); setFrom(e.target.value); }} />
            </Field>
            <Field label="To">
              <DateInput value={to} min={from || undefined} onChange={(e) => { setPage(1); setTo(e.target.value); }} />
            </Field>
          </div>
          {isAdmin && (
            <label className="flex min-h-11 items-center gap-3 text-sm text-ink-2">
              <input
                type="checkbox"
                className="h-5 w-5 accent-[var(--primary)]"
                checked={showDeleted}
                onChange={(e) => {
                  setPage(1);
                  setShowDeleted(e.target.checked);
                }}
              />
              Show deleted expenses
            </label>
          )}
        </div>
      </Sheet>

      {sheet.open && (
        <TransactionSheet
          projectId={projectId}
          categories={categories}
          entry={sheet.entry}
          isAdmin={isAdmin}
          onClose={() => setSheet({ open: false, entry: null })}
          onSaved={(msg) => {
            toast.notify(msg);
            setSheet({ open: false, entry: null });
            void load();
          }}
          onDelete={(t) => {
            setSheet({ open: false, entry: null });
            void softDelete(t);
          }}
          onDeleteAttachment={requestDeleteAttachment}
          onMessage={(m) => toast.notify(m, 'info')}
        />
      )}

      <Lightbox
        url={viewer ? viewer.images[viewer.index]?.url ?? null : null}
        caption={viewer ? viewer.images[viewer.index]?.originalName ?? undefined : undefined}
        position={viewer && viewer.images.length > 1 ? `${viewer.index + 1} of ${viewer.images.length}` : undefined}
        onClose={() => setViewer(null)}
        onPrev={viewer && viewer.index > 0 ? () => setViewer((v) => (v ? { ...v, index: v.index - 1 } : v)) : undefined}
        onNext={
          viewer && viewer.index < viewer.images.length - 1
            ? () => setViewer((v) => (v ? { ...v, index: v.index + 1 } : v))
            : undefined
        }
      />

      <ConfirmDialog
        open={confirm.open}
        title="Are you sure?"
        message={confirm.message}
        confirmLabel="Remove"
        destructive
        onConfirm={confirm.run}
        onCancel={() => setConfirm((c) => ({ ...c, open: false }))}
      />
    </div>
  );
}

function DeletedBadge() {
  return (
    <span className="shrink-0 rounded-full bg-danger-tint px-2 py-0.5 text-xs font-medium text-danger">Deleted</span>
  );
}

function TableSkeleton() {
  return (
    <div role="status" aria-label="Loading expenses" className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block">
      <div className="h-10 bg-surface-2" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-t border-border px-4 py-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex min-h-8 items-center gap-1 rounded-full bg-primary-tint pl-3 text-xs font-medium text-primary">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${label} filter`}
        className="-my-1.5 flex h-11 w-9 items-center justify-center rounded-full hover:text-primary-hover"
      >
        <X size={14} aria-hidden />
      </button>
    </span>
  );
}

function TransactionSheet({
  projectId,
  categories,
  entry,
  isAdmin,
  onClose,
  onSaved,
  onDelete,
  onDeleteAttachment,
  onMessage,
}: {
  projectId: string;
  categories: Category[];
  entry: Transaction | null;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  onDelete: (entry: Transaction) => void;
  onDeleteAttachment: (id: string) => void;
  onMessage: (message: string) => void;
}) {
  const [categoryId, setCategoryId] = useState(entry?.category.id ?? '');
  const [occurredAt, setOccurredAt] = useState(() => (entry ? todayIST(new Date(entry.occurredAt)) : todayIST()));
  const [amount, setAmount] = useState(entry ? Number(entry.amount).toString() : '');
  const [gstAmount, setGstAmount] = useState(entry ? Number(entry.gstAmount).toString() : '');
  const [vendor, setVendor] = useState(entry?.vendor ?? '');
  const [paymentMode, setPaymentMode] = useState(entry?.paymentMode ?? 'cash');
  const [description, setDescription] = useState(entry?.description ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idemKey = useRef<string>(newIdempotencyKey());
  const uploads = useUploads(projectId, 'transaction', entry?.attachments.length ?? 0);

  const options: Category[] =
    entry && !categories.some((c) => c.id === entry.category.id)
      ? [{ id: entry.category.id, name: `${entry.category.name} (inactive)`, type: '' }, ...categories]
      : categories;
  const selectedCategoryId = categoryId || options[0]?.id || '';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (uploads.busy) {
      setError('Wait for uploads to finish.');
      return;
    }
    if (uploads.failed) {
      setError('Retry or remove the files that failed to upload.');
      return;
    }
    if (Number(gstAmount || 0) > Number(amount)) {
      setError('GST can’t be more than the amount (GST is included in it).');
      return;
    }
    setPending(true);
    try {
      if (entry) {
        await api.patch(`/api/projects/${projectId}/transactions/${entry.id}`, {
          categoryId: selectedCategoryId,
          occurredAt, // bare YYYY-MM-DD: the server reads it as an IST calendar date
          amount: Number(amount),
          gstAmount: Number(gstAmount || 0),
          vendor: vendor || null,
          paymentMode,
          description: description || null,
          version: entry.version,
        });
        await uploads.finalizeAll({ transactionId: entry.id });
        onSaved('Expense updated');
      } else {
        const attachmentIds = await uploads.finalizeAll();
        await api.post(
          `/api/projects/${projectId}/transactions`,
          {
            categoryId: selectedCategoryId,
            occurredAt,
            amount: Number(amount),
            gstAmount: Number(gstAmount || 0),
            vendor: vendor || null,
            paymentMode,
            description: description || null,
            attachmentIds,
          },
          { 'Idempotency-Key': idemKey.current },
        );
        idemKey.current = newIdempotencyKey();
        onSaved('Expense added');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setPending(false);
    }
  }

  if (options.length === 0) {
    return (
      <Sheet open onClose={onClose} title="Add expense">
        <p className="text-sm text-ink-2">Create a category first (Settings) before adding expenses.</p>
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={entry ? 'Edit expense' : 'Add expense'}
      footer={
        <div className="flex gap-2">
          {entry && isAdmin && (
            <Button variant="ghost" className="text-danger hover:bg-danger-tint" onClick={() => onDelete(entry)}>
              <Trash2 size={16} aria-hidden /> Delete
            </Button>
          )}
          <div className="flex flex-1 justify-end gap-2">
            <Button variant="secondary" className="flex-1 md:flex-none" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="tx-form" className="flex-1 md:flex-none" loading={pending} disabled={uploads.busy}>
              Save
            </Button>
          </div>
        </div>
      }
    >
      <form id="tx-form" onSubmit={submit} className="space-y-3">
        <Field label="Amount">
          <MoneyInput value={amount} onValueChange={setAmount} placeholder="0" autoFocus />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <DateInput value={occurredAt} max={todayIST()} onChange={(e) => setOccurredAt(e.target.value)} required />
          </Field>
          <Field label="GST" hint="Included in amount">
            <MoneyInput value={gstAmount} onValueChange={setGstAmount} placeholder="0" />
          </Field>
        </div>

        <Field label="Category">
          <Select value={selectedCategoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Payment mode">
          <div>
            <Segmented options={PAYMENT_OPTIONS} value={paymentMode} onChange={setPaymentMode} />
          </div>
        </Field>

        <Field label="Vendor">
          <TextInput value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Optional" />
        </Field>

        <Field label="Notes">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
        </Field>

        {entry && entry.attachments.length > 0 && (
          <div>
            <span className="text-[13px] font-semibold text-ink-2">Attachments</span>
            <AttachmentList attachments={entry.attachments} thumbClass="h-16 w-16" onDelete={onDeleteAttachment} />
          </div>
        )}

        <UploadPicker label={entry ? 'Add bills' : 'Bill photos or files'} uploads={uploads} onMessage={onMessage} />

        {error && <Alert message={error} />}
      </form>
    </Sheet>
  );
}
