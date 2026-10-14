'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  FileText,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-react';
import { api, newIdempotencyKey } from '@/lib/api-client';
import { todayIST } from '@/lib/period';
import { formatDayLabel, formatINR } from '@/lib/format';
import { AttachmentList, type AttachmentItem } from '@/components/AttachmentList';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Sheet } from '@/components/ui/Sheet';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
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
  const [confirm, setConfirm] = useState<{ open: boolean; message: string; run: () => void }>({
    open: false,
    message: '',
    run: () => undefined,
  });

  const [page, setPage] = useState(1);
  const [categoryId, setCategoryId] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [vendor, setVendor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const isAdmin = role === 'admin';
  const canEdit = role === 'admin' || role === 'editor';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: '25' });
      if (showDeleted) qs.set('includeDeleted', 'true');
      if (categoryId) qs.set('categoryId', categoryId);
      if (paymentMode) qs.set('paymentMode', paymentMode);
      if (vendor) qs.set('vendor', vendor);
      if (from) qs.set('from', new Date(from).toISOString());
      if (to) qs.set('to', new Date(`${to}T23:59:59`).toISOString());

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

  const activeFilters = useMemo(
    () => [categoryId, paymentMode, vendor, from, to].filter(Boolean).length,
    [categoryId, paymentMode, vendor, from, to],
  );

  const grouped = useMemo(() => {
    const groups: { key: string; label: string; total: number; rows: Transaction[] }[] = [];
    for (const t of items) {
      const key = new Date(t.occurredAt).toISOString().slice(0, 10);
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

  function resetFilters() {
    setCategoryId('');
    setPaymentMode('');
    setVendor('');
    setFrom('');
    setTo('');
    setPage(1);
  }

  function requestDelete(t: Transaction) {
    setConfirm({
      open: true,
      message: `Delete this ${formatINR(t.amount)} expense? An admin can restore it.`,
      run: async () => {
        setConfirm((c) => ({ ...c, open: false }));
        try {
          await api.delete(`/api/projects/${projectId}/transactions/${t.id}`);
          toast.notify('Expense deleted');
          void load();
        } catch (err) {
          toast.notify(err instanceof Error ? err.message : 'Failed to delete', 'error');
        }
      },
    });
  }

  async function restore(t: Transaction) {
    try {
      await api.post(`/api/projects/${projectId}/transactions/${t.id}/restore`);
      toast.notify('Expense restored');
      void load();
    } catch (err) {
      toast.notify(err instanceof Error ? err.message : 'Failed to restore', 'error');
    }
  }

  function requestDeleteAttachment(id: string) {
    setConfirm({
      open: true,
      message: 'Remove this attachment?',
      run: async () => {
        setConfirm((c) => ({ ...c, open: false }));
        try {
          await api.delete(`/api/attachments/${id}`);
          toast.notify('Attachment removed');
          void load();
        } catch (err) {
          toast.notify(err instanceof Error ? err.message : 'Failed to remove', 'error');
        }
      },
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold">Expenses</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setFiltersOpen(true)} className="h-11">
            <SlidersHorizontal size={16} aria-hidden />
            Filters{activeFilters ? ` · ${activeFilters}` : ''}
          </Button>
          <Button onClick={() => setSheet({ open: true, entry: null })} className="hidden sm:inline-flex">
            <Plus size={16} aria-hidden /> Add
          </Button>
        </div>
      </div>

      {activeFilters > 0 && (
        <div className="flex flex-wrap gap-2">
          {categoryId && (
            <FilterChip label={categories.find((c) => c.id === categoryId)?.name ?? 'Category'} onClear={() => setCategoryId('')} />
          )}
          {paymentMode && <FilterChip label={PAYMENT_LABEL[paymentMode] ?? paymentMode} onClear={() => setPaymentMode('')} />}
          {vendor && <FilterChip label={vendor} onClear={() => setVendor('')} />}
          {from && <FilterChip label={`From ${from}`} onClear={() => setFrom('')} />}
          {to && <FilterChip label={`To ${to}`} onClear={() => setTo('')} />}
          <button type="button" onClick={resetFilters} className="text-sm text-ink-3 hover:text-ink">
            Clear all
          </button>
        </div>
      )}

      {error && <Alert message={error} onRetry={load} />}

      {loading && items.length === 0 ? (
        <SkeletonRows />
      ) : items.length === 0 ? (
        <EmptyState
          title="No expenses match."
          action={
            activeFilters ? (
              <Button variant="secondary" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : (
              <Button onClick={() => setSheet({ open: true, entry: null })}>
                <Plus size={16} aria-hidden /> Add expense
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <section key={g.key}>
              <header className="sticky top-0 z-10 flex items-center justify-between bg-bg/95 px-1 py-1.5 text-xs text-ink-3 backdrop-blur">
                <span className="font-semibold">{g.label}</span>
                <span className="num">{formatINR(g.total)}</span>
              </header>
              <ul className="divide-y divide-border overflow-hidden rounded-lg bg-surface shadow-sm">
                {g.rows.map((t) => (
                  <li key={t.id} className={`p-3 text-sm ${t.deletedAt ? 'opacity-70' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{t.category.name}</span>
                          {t.deletedAt && (
                            <span className="rounded bg-danger-tint px-1.5 py-0.5 text-[11px] text-danger">Deleted</span>
                          )}
                        </div>
                        <div className="truncate text-ink-3">
                          {[t.vendor, PAYMENT_LABEL[t.paymentMode] ?? t.paymentMode].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="num font-medium">{formatINR(t.amount)}</span>
                        {canEdit && !t.deletedAt && (
                          <details className="relative">
                            <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                              <MoreVertical size={18} aria-hidden />
                              <span className="sr-only">Actions</span>
                            </summary>
                            <div className="absolute right-0 z-20 mt-1 w-40 rounded-md border border-border bg-surface py-1 shadow-e2">
                              <button
                                type="button"
                                onClick={() => setSheet({ open: true, entry: t })}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2"
                              >
                                <Pencil size={15} aria-hidden /> Edit
                              </button>
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => requestDelete(t)}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-danger hover:bg-danger-tint"
                                >
                                  <Trash2 size={15} aria-hidden /> Delete
                                </button>
                              )}
                            </div>
                          </details>
                        )}
                        {isAdmin && t.deletedAt && (
                          <IconButton label="Restore" onClick={() => restore(t)}>
                            <RotateCcw size={16} />
                          </IconButton>
                        )}
                      </div>
                    </div>
                    <AttachmentList
                      attachments={t.attachments}
                      thumbClass="h-14 w-14"
                      onDelete={canEdit ? requestDeleteAttachment : undefined}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ‹ Prev
          </Button>
          <span className="text-ink-3">
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
          className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-e2 sm:hidden"
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
          <Field label="Vendor">
            <TextInput value={vendor} onChange={(e) => { setPage(1); setVendor(e.target.value); }} placeholder="Any vendor" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <DateInput value={from} onChange={(e) => { setPage(1); setFrom(e.target.value); }} />
            </Field>
            <Field label="To">
              <DateInput value={to} onChange={(e) => { setPage(1); setTo(e.target.value); }} />
            </Field>
          </div>
          {isAdmin && (
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <input
                type="checkbox"
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
          onDeleteAttachment={requestDeleteAttachment}
        />
      )}

      <ConfirmDialog
        open={confirm.open}
        title="Are you sure?"
        message={confirm.message}
        confirmLabel="Delete"
        destructive
        onConfirm={confirm.run}
        onCancel={() => setConfirm((c) => ({ ...c, open: false }))}
      />
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary-tint px-3 py-1 text-xs font-medium text-primary">
      {label}
      <button type="button" onClick={onClear} aria-label={`Remove ${label} filter`} className="text-primary/70 hover:text-primary">
        ×
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
  onDeleteAttachment,
}: {
  projectId: string;
  categories: Category[];
  entry: Transaction | null;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  onDeleteAttachment: (id: string) => void;
}) {
  const [categoryId, setCategoryId] = useState(entry?.category.id ?? '');
  const [occurredAt, setOccurredAt] = useState(() => (entry ? entry.occurredAt.slice(0, 10) : todayIST()));
  const [amount, setAmount] = useState(entry ? Number(entry.amount).toString() : '');
  const [gstAmount, setGstAmount] = useState(entry ? Number(entry.gstAmount).toString() : '');
  const [vendor, setVendor] = useState(entry?.vendor ?? '');
  const [paymentMode, setPaymentMode] = useState(entry?.paymentMode ?? 'cash');
  const [description, setDescription] = useState(entry?.description ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idemKey = useRef<string>(newIdempotencyKey());
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const options: Category[] =
    entry && !categories.some((c) => c.id === entry.category.id)
      ? [{ id: entry.category.id, name: `${entry.category.name} (inactive)`, type: '' }, ...categories]
      : categories;
  const selectedCategoryId = categoryId || options[0]?.id || '';

  async function uploadPhoto(f: File, parentId?: string): Promise<string> {
    const presign = await api.post<{ uploadUrl: string; attachmentId: string }>('/api/uploads/presign', {
      projectId,
      parentType: 'transaction',
      filename: f.name,
      mimeType: f.type,
      size: f.size,
    });
    const put = await fetch(presign.uploadUrl, { method: 'PUT', body: f, headers: { 'Content-Type': f.type } });
    if (!put.ok) throw new Error('Upload failed');
    await api.post(`/api/uploads/${presign.attachmentId}/finalize`, parentId ? { transactionId: parentId } : {});
    return presign.attachmentId;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (entry) {
        await api.patch(`/api/projects/${projectId}/transactions/${entry.id}`, {
          categoryId: selectedCategoryId,
          occurredAt: new Date(occurredAt).toISOString(),
          amount: Number(amount),
          gstAmount: Number(gstAmount || 0),
          vendor: vendor || null,
          paymentMode,
          description: description || null,
          version: entry.version,
        });
        if (file) await uploadPhoto(file, entry.id);
        onSaved('Expense updated');
      } else {
        const attachmentIds: string[] = [];
        if (file) attachmentIds.push(await uploadPhoto(file));
        await api.post(
          `/api/projects/${projectId}/transactions`,
          {
            categoryId: selectedCategoryId,
            occurredAt: new Date(occurredAt).toISOString(),
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
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="tx-form" className="flex-1" loading={pending}>
            Save
          </Button>
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

        <div>
          <span className="text-[13px] font-semibold text-ink-2">Bill photo or file</span>
          <div className="mt-1 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => cameraRef.current?.click()}>
              <Camera size={16} aria-hidden /> Camera
            </Button>
            <Button type="button" variant="secondary" onClick={() => uploadRef.current?.click()}>
              <Upload size={16} aria-hidden /> Upload
            </Button>
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <input
            ref={uploadRef}
            type="file"
            accept="image/*,.pdf,.txt,.csv,.xls,.xlsx"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <p className="mt-1 flex items-center gap-1 text-xs text-ink-3">
              <FileText size={13} aria-hidden /> {file.name}
            </p>
          )}
        </div>

        {error && <Alert message={error} />}
      </form>
    </Sheet>
  );
}
