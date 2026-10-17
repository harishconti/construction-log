'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  FunnelX,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { api, newIdempotencyKey } from '@/lib/api-client';
import { FUNDING_SOURCES, FUNDING_SOURCE_HINT, FUNDING_SOURCE_LABEL } from '@/lib/funding';
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
import { FundingIcon } from '@/components/FundingIcon';
import { DateInput, Field, MoneyInput, Select, Segmented, Textarea, TextInput } from '@/components/ui/inputs';

export type Funding = {
  id: string;
  receivedAt: string;
  amount: string;
  source: string;
  sourceName: string | null;
  mode: string;
  reference: string | null;
  description: string | null;
  version: number;
  deletedAt: string | null;
  attachments: AttachmentItem[];
};
type Page = { page: number; limit: number; total: number; pages: number };

const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank: 'Bank transfer',
  card: 'Card',
  credit: 'Credit',
};
const MODE_OPTIONS = Object.keys(PAYMENT_LABEL).map((m) => ({ value: m, label: PAYMENT_LABEL[m] }));
const SOURCE_OPTIONS = FUNDING_SOURCES.map((s) => ({ value: s, label: FUNDING_SOURCE_LABEL[s] }));

const SEARCH_DEBOUNCE_MS = 300;

function sourceLabel(source: string): string {
  return (FUNDING_SOURCE_LABEL as Record<string, string>)[source] ?? source;
}

/** First viewable image of a funding entry, for the leading thumbnail. */
function firstImage(f: Funding): AttachmentItem | undefined {
  return f.attachments.find(isImage);
}

export function FundingView({
  projectId,
  role,
  initial,
}: {
  projectId: string;
  role: string;
  /** First page (default filters) rendered with the page, so there is no fetch on arrival. */
  initial?: { items: Funding[]; pagination: Page };
}) {
  const toast = useToast();
  const [items, setItems] = useState<Funding[]>(initial?.items ?? []);
  const [pagination, setPagination] = useState<Page | null>(initial?.pagination ?? null);
  const [loading, setLoading] = useState(!initial);
  const usedInitial = useRef(Boolean(initial));
  const [error, setError] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const [sheet, setSheet] = useState<{ open: boolean; entry: Funding | null }>({ open: false, entry: null });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewer, setViewer] = useState<{ images: AttachmentItem[]; index: number } | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ open: boolean; message: string; run: () => void }>({
    open: false,
    message: '',
    run: () => undefined,
  });

  const [page, setPage] = useState(1);
  const [source, setSource] = useState('');
  const [search, setSearch] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const isAdmin = role === 'admin';
  const canEdit = role === 'admin' || role === 'editor';

  // Debounce the search box into the `sourceName` query param.
  useEffect(() => {
    const term = search.trim();
    if (term === sourceName) return;
    const t = setTimeout(() => {
      setPage(1);
      setSourceName(term);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search, sourceName]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: '25' });
      if (showDeleted) qs.set('includeDeleted', 'true');
      if (source) qs.set('source', source);
      if (sourceName) qs.set('sourceName', sourceName);
      if (from) qs.set('from', istDateToInstant(from).toISOString());
      if (to) qs.set('to', istDayEnd(to).toISOString());

      const res = await api.get<{ items: Funding[]; pagination: Page }>(
        `/api/projects/${projectId}/funding?${qs.toString()}`,
      );
      setItems(res.items);
      setPagination(res.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [projectId, page, showDeleted, source, sourceName, from, to]);

  useEffect(() => {
    // The server already rendered the default first page; fetch only when filters/paging change.
    if (usedInitial.current) {
      usedInitial.current = false;
      return;
    }
    void load();
  }, [load]);

  // Deep link from the dashboard: /funding#funding-<id> scrolls to and highlights the row.
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current || items.length === 0) return;
    const match = window.location.hash.match(/^#funding-(.+)$/);
    if (!match) return;
    linked.current = true;
    const id = decodeURIComponent(match[1]);
    if (!items.some((f) => f.id === id)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHighlight(id);
    requestAnimationFrame(() => {
      const visible = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-funding="${CSS.escape(id)}"]`),
      ).find((el) => el.offsetParent !== null);
      visible?.scrollIntoView({ block: 'center' });
    });
    const t = setTimeout(() => setHighlight(null), 2500);
    return () => clearTimeout(t);
  }, [items]);

  const activeFilters = useMemo(() => [source, from, to].filter(Boolean).length, [source, from, to]);

  const grouped = useMemo(() => {
    const groups: { key: string; label: string; total: number; rows: Funding[] }[] = [];
    for (const f of items) {
      const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(f.receivedAt));
      const label = formatDayLabel(f.receivedAt);
      let g = groups.find((x) => x.key === key);
      if (!g) {
        g = { key, label, total: 0, rows: [] };
        groups.push(g);
      }
      g.rows.push(f);
      if (!f.deletedAt) g.total += Number(f.amount);
    }
    return groups;
  }, [items]);

  const visibleTotal = useMemo(
    () => items.reduce((sum, f) => (f.deletedAt ? sum : sum + Number(f.amount)), 0),
    [items],
  );
  const liveCount = items.filter((f) => !f.deletedAt).length;

  function resetFilters() {
    setSource('');
    setSearch('');
    setSourceName('');
    setFrom('');
    setTo('');
    setPage(1);
  }

  function openEdit(f: Funding) {
    if (canEdit && !f.deletedAt) setSheet({ open: true, entry: f });
  }

  async function restore(f: Funding, quiet = false) {
    try {
      await api.post(`/api/projects/${projectId}/funding/${f.id}/restore`);
      toast.notify('Funding entry restored');
      void load();
    } catch (err) {
      if (!quiet) toast.notify(err instanceof Error ? err.message : 'Failed to restore', 'error');
      else toast.notify('Could not undo the delete', 'error');
    }
  }

  // Soft delete is reversible, so delete immediately and offer Undo instead of confirming first.
  async function softDelete(f: Funding) {
    try {
      await api.delete(`/api/projects/${projectId}/funding/${f.id}`);
      toast.notify('Funding entry deleted', 'success', {
        action: { label: 'Undo', onClick: () => void restore(f, true) },
      });
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

  function menuItems(f: Funding) {
    return [
      { label: 'Edit', icon: <Pencil size={16} aria-hidden />, onSelect: () => openEdit(f) },
      ...(isAdmin
        ? [{ label: 'Delete', icon: <Trash2 size={16} aria-hidden />, danger: true, onSelect: () => void softDelete(f) }]
        : []),
    ];
  }

  function trailingActions(f: Funding) {
    if (f.deletedAt) {
      return isAdmin ? (
        <IconButton label="Restore" onClick={(e) => { e.stopPropagation(); void restore(f); }}>
          <RotateCcw size={16} />
        </IconButton>
      ) : null;
    }
    return canEdit ? <RowMenu items={menuItems(f)} label={`Actions for ${title(f)}`} /> : null;
  }

  function proofCell(f: Funding, size: 'sm' | 'md') {
    const img = firstImage(f);
    const box = size === 'md' ? 'h-11 w-11' : 'h-9 w-9';
    if (img) {
      const images = f.attachments.filter(isImage);
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setViewer({ images, index: 0 });
          }}
          aria-label={`View proof for ${title(f)}`}
          className={`relative ${box} shrink-0 overflow-hidden rounded-sm ring-1 ring-border`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.url} alt="" loading="lazy" className="h-full w-full object-cover" />
          {f.attachments.length > 1 && (
            <span className="num absolute bottom-0 right-0 rounded-tl-sm bg-[#1a1d21] px-1 text-xs font-semibold leading-4 text-white">
              {f.attachments.length}
            </span>
          )}
        </button>
      );
    }
    const file = f.attachments[0];
    if (file) {
      return (
        <a
          href={file.downloadUrl}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Download ${file.originalName ?? 'proof'}`}
          className={`flex ${box} shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink-2 hover:text-ink`}
        >
          <FileText size={18} aria-hidden />
        </a>
      );
    }
    return (
      <span className={`flex ${box} shrink-0 items-center justify-center rounded-sm bg-ok-tint text-ok`} aria-hidden>
        <FundingIcon source={f.source} />
      </span>
    );
  }

  const mode = (f: Funding) => PAYMENT_LABEL[f.mode] ?? f.mode;
  const title = (f: Funding) => f.sourceName || sourceLabel(f.source);

  const empty = !loading && items.length === 0;
  const filtered = activeFilters > 0 || Boolean(sourceName);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h1 className="font-display text-2xl font-bold lg:text-[28px]">Funding</h1>
          {pagination && <span className="num text-sm text-ink-3">{pagination.total}</span>}
        </div>
        {canEdit && (
          <Button onClick={() => setSheet({ open: true, entry: null })} className="hidden md:inline-flex">
            <Plus size={16} aria-hidden /> Add funding
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1 md:max-w-sm">
          <label htmlFor="funding-search" className="sr-only">
            Search party
          </label>
          <Search size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            id="funding-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bank or party"
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
          {source && (
            <FilterChip label={sourceLabel(source)} onClear={() => { setPage(1); setSource(''); }} />
          )}
          {from && <FilterChip label={`From ${formatDate(from)}`} onClear={() => { setPage(1); setFrom(''); }} />}
          {to && <FilterChip label={`To ${formatDate(to)}`} onClear={() => { setPage(1); setTo(''); }} />}
          <button type="button" onClick={resetFilters} className="inline-flex min-h-11 items-center gap-1 px-2 text-sm text-ink-2 hover:text-ink">
            <X size={14} aria-hidden /> Clear all
          </button>
        </div>
      )}

      {error && <Alert message={error} onRetry={load} />}

      {loading && items.length === 0 ? (
        <>
          <div className="md:hidden">
            <SkeletonRows leading trailing label="Loading funding" />
          </div>
          <TableSkeleton />
        </>
      ) : empty ? (
        <EmptyState
          title={filtered ? 'No funding entries match these filters.' : 'No funding yet — record how the project is being paid for.'}
          action={
            filtered ? (
              <Button variant="secondary" onClick={resetFilters}>
                <FunnelX size={16} aria-hidden /> Clear filters
              </Button>
            ) : canEdit ? (
              <Button onClick={() => setSheet({ open: true, entry: null })}>
                <Plus size={16} aria-hidden /> Add your first funding
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
                  {g.rows.map((f) => (
                    <li
                      key={f.id}
                      data-funding={f.id}
                      onClick={() => openEdit(f)}
                      className={`flex items-center gap-3 py-2 pl-3 pr-1 text-sm transition-colors ${
                        canEdit && !f.deletedAt ? 'cursor-pointer active:bg-surface-2' : ''
                      } ${highlight === f.id ? 'bg-primary-tint' : ''}`}
                    >
                      {proofCell(f, 'md')}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          {canEdit && !f.deletedAt ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openEdit(f); }}
                              className="line-clamp-2 break-words text-left font-medium leading-snug"
                            >
                              {title(f)}
                            </button>
                          ) : (
                            <span className={`line-clamp-2 break-words font-medium leading-snug ${f.deletedAt ? 'line-through' : ''}`}>
                              {title(f)}
                            </span>
                          )}
                          {f.deletedAt && <DeletedBadge />}
                        </div>
                        <div className="truncate text-ink-2">
                          {[f.sourceName ? sourceLabel(f.source) : null, mode(f)].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`num font-semibold text-ok ${f.deletedAt ? 'line-through' : ''}`}>
                          +{formatINR(f.amount)}
                        </div>
                        {f.reference && <div className="truncate text-xs text-ink-3">{f.reference}</div>}
                      </div>
                      <div className="flex w-11 shrink-0 justify-center">{trailingActions(f)}</div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {/* Keeps the last row clear of the floating Add button. */}
            {canEdit && <div aria-hidden className="h-20" />}
          </div>

          {/* md+: table */}
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs text-ink-2">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Date</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Source</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Party</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Received via</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Proof</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Amount</th>
                  <th scope="col" className="w-14 px-2 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((f) => (
                  <tr
                    key={f.id}
                    data-funding={f.id}
                    onClick={() => openEdit(f)}
                    className={`transition-colors ${canEdit && !f.deletedAt ? 'cursor-pointer hover:bg-surface-2' : ''} ${
                      highlight === f.id ? 'bg-primary-tint' : ''
                    }`}
                  >
                    <td className="num whitespace-nowrap px-4 py-2 text-ink-2">{formatDate(f.receivedAt)}</td>
                    <td className="px-3 py-2 text-ink-2">{sourceLabel(f.source)}</td>
                    <td className="max-w-[16rem] px-3 py-2">
                      <div className="flex items-center gap-2">
                        {canEdit && !f.deletedAt ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openEdit(f); }}
                            className="truncate text-left font-medium hover:underline"
                          >
                            {f.sourceName || '—'}
                          </button>
                        ) : (
                          <span className={`truncate font-medium ${f.deletedAt ? 'line-through' : ''}`}>{f.sourceName || '—'}</span>
                        )}
                        {f.deletedAt && <DeletedBadge />}
                      </div>
                      {f.description && <div className="truncate text-xs text-ink-3">{f.description}</div>}
                    </td>
                    <td className="px-3 py-2 text-ink-2">{mode(f)}</td>
                    <td className="px-3 py-2">{f.attachments.length > 0 ? proofCell(f, 'sm') : <span className="text-ink-3">—</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <div className={`num font-semibold text-ok ${f.deletedAt ? 'line-through' : ''}`}>
                        +{formatINR(f.amount)}
                      </div>
                      {f.reference && <div className="truncate text-xs text-ink-3">{f.reference}</div>}
                    </td>
                    <td className="px-2 py-1 text-right">{trailingActions(f)}</td>
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
                        : `${liveCount} ${liveCount === 1 ? 'entry' : 'entries'}`}
                      {filtered ? ' · filtered' : ''}
                    </span>
                  </th>
                  <td className="num px-3 py-3 text-right font-semibold text-ok">{formatINR(visibleTotal)}</td>
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
            <ChevronLeft size={16} aria-hidden /> Prev
          </Button>
          <span className="num text-ink-2">
            {pagination.page} / {pagination.pages}
          </span>
          <Button variant="secondary" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>
            Next <ChevronRight size={16} aria-hidden />
          </Button>
        </div>
      )}

      {/* Mobile FAB */}
      {canEdit && (
        <button
          type="button"
          aria-label="Add funding"
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
          <Field label="Source">
            <Select value={source} onChange={(e) => { setPage(1); setSource(e.target.value); }}>
              <option value="">All sources</option>
              {FUNDING_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {FUNDING_SOURCE_LABEL[s]}
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
              Show deleted funding
            </label>
          )}
        </div>
      </Sheet>

      {sheet.open && (
        <FundingSheet
          projectId={projectId}
          entry={sheet.entry}
          isAdmin={isAdmin}
          onClose={() => setSheet({ open: false, entry: null })}
          onSaved={(msg) => {
            toast.notify(msg);
            setSheet({ open: false, entry: null });
            void load();
          }}
          onDelete={(f) => {
            setSheet({ open: false, entry: null });
            void softDelete(f);
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
    <div role="status" aria-label="Loading funding" className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block">
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

function FundingSheet({
  projectId,
  entry,
  isAdmin,
  onClose,
  onSaved,
  onDelete,
  onDeleteAttachment,
  onMessage,
}: {
  projectId: string;
  entry: Funding | null;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  onDelete: (entry: Funding) => void;
  onDeleteAttachment: (id: string) => void;
  onMessage: (message: string) => void;
}) {
  const [source, setSource] = useState(entry?.source ?? 'self');
  const [sourceName, setSourceName] = useState(entry?.sourceName ?? '');
  const [receivedAt, setReceivedAt] = useState(() => (entry ? todayIST(new Date(entry.receivedAt)) : todayIST()));
  const [amount, setAmount] = useState(entry ? Number(entry.amount).toString() : '');
  const [mode, setMode] = useState(entry?.mode ?? 'bank');
  const [reference, setReference] = useState(entry?.reference ?? '');
  const [description, setDescription] = useState(entry?.description ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idemKey = useRef<string>(newIdempotencyKey());
  const uploads = useUploads(projectId, 'funding', entry?.attachments.length ?? 0);

  const hint = (FUNDING_SOURCE_HINT as Record<string, string>)[source];

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
    setPending(true);
    try {
      if (entry) {
        await api.patch(`/api/projects/${projectId}/funding/${entry.id}`, {
          source,
          sourceName: sourceName || null,
          receivedAt, // bare YYYY-MM-DD: the server reads it as an IST calendar date
          amount: Number(amount),
          mode,
          reference: reference || null,
          description: description || null,
          version: entry.version,
        });
        await uploads.finalizeAll({ fundingId: entry.id });
        onSaved('Funding updated');
      } else {
        const attachmentIds = await uploads.finalizeAll();
        await api.post(
          `/api/projects/${projectId}/funding`,
          {
            source,
            sourceName: sourceName || null,
            receivedAt,
            amount: Number(amount),
            mode,
            reference: reference || null,
            description: description || null,
            attachmentIds,
          },
          { 'Idempotency-Key': idemKey.current },
        );
        idemKey.current = newIdempotencyKey();
        onSaved('Funding added');
      }
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
      title={entry ? 'Edit funding' : 'Add funding'}
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
            <Button type="submit" form="funding-form" className="flex-1 md:flex-none" loading={pending} disabled={uploads.busy}>
              Save
            </Button>
          </div>
        </div>
      }
    >
      <form id="funding-form" onSubmit={submit} className="space-y-3">
        <Field label="Amount">
          <MoneyInput value={amount} onValueChange={setAmount} placeholder="0" autoFocus />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date received">
            <DateInput value={receivedAt} max={todayIST()} onChange={(e) => setReceivedAt(e.target.value)} required />
          </Field>
          <Field label="Received via">
            <div className="pt-1">
              <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} />
            </div>
          </Field>
        </div>

        <Field label="Source" hint={hint}>
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Party" hint="Optional — bank or person">
          <TextInput
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            placeholder="e.g. HDFC Bank, Mr. Sharma"
          />
        </Field>

        <Field label="Reference" hint="Optional — cheque no, UTR or loan account">
          <TextInput value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
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

        <UploadPicker label={entry ? 'Add proof' : 'Proof (receipt, loan agreement)'} uploads={uploads} onMessage={onMessage} />

        {error && <Alert message={error} />}
      </form>
    </Sheet>
  );
}
