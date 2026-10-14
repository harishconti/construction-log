'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { todayIST } from '@/lib/period';
import { AttachmentList, type AttachmentItem } from '@/components/AttachmentList';

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

export function TransactionsView({
  projectId,
  role,
}: {
  projectId: string;
  currentUserId: string;
  role: string;
}) {
  const [items, setItems] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pagination, setPagination] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  // filters
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

  function resetFilters() {
    setCategoryId('');
    setPaymentMode('');
    setVendor('');
    setFrom('');
    setTo('');
    setPage(1);
  }

  async function remove(t: Transaction) {
    if (!window.confirm('Delete this transaction? (can be restored by an admin)')) return;
    setError(null);
    try {
      await api.delete(`/api/projects/${projectId}/transactions/${t.id}`);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  async function restore(t: Transaction) {
    setError(null);
    try {
      await api.post(`/api/projects/${projectId}/transactions/${t.id}/restore`);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore');
    }
  }

  async function deleteAttachment(id: string) {
    if (!window.confirm('Remove this attachment?')) return;
    setError(null);
    try {
      await api.delete(`/api/attachments/${id}`);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove attachment');
    }
  }

  const hasFilters = Boolean(categoryId || paymentMode || vendor || from || to);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Transactions</h1>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <label className="flex items-center gap-1 text-sm text-slate-600">
              <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
              Show deleted
            </label>
          )}
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white"
          >
            {showForm ? 'Close' : 'Add'}
          </button>
        </div>
      </div>

      {showForm && (
        <TransactionForm
          projectId={projectId}
          categories={categories}
          onSaved={() => {
            setShowForm(false);
            void load();
          }}
        />
      )}

      <div className="rounded-xl bg-white p-3 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <select
            value={categoryId}
            onChange={(e) => {
              setPage(1);
              setCategoryId(e.target.value);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={paymentMode}
            onChange={(e) => {
              setPage(1);
              setPaymentMode(e.target.value);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All payment modes</option>
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            placeholder="Vendor"
            value={vendor}
            onChange={(e) => {
              setPage(1);
              setVendor(e.target.value);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setPage(1);
              setFrom(e.target.value);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setPage(1);
              setTo(e.target.value);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        {hasFilters && (
          <button type="button" onClick={resetFilters} className="mt-2 text-sm text-slate-500 hover:text-slate-900">
            Clear filters
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No transactions match.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm">
          {items.map((t) => {
            if (editingId === t.id) {
              return (
                <li key={t.id} className="p-2">
                  <TransactionForm
                    projectId={projectId}
                    categories={categories}
                    entry={t}
                    onSaved={() => {
                      setEditingId(null);
                      void load();
                    }}
                    onCancel={() => setEditingId(null)}
                    onDeleteAttachment={deleteAttachment}
                  />
                </li>
              );
            }
            return (
              <li key={t.id} className={`p-3 text-sm ${t.deletedAt ? 'opacity-60' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">
                      {new Date(t.occurredAt).toLocaleDateString()} · {t.category.name}
                      {t.deletedAt && (
                        <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-600">deleted</span>
                      )}
                    </div>
                    <div className="text-slate-500">{[t.vendor, t.paymentMode].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">₹{Number(t.amount).toLocaleString('en-IN')}</span>
                    {!t.deletedAt && canEdit && (
                      <button type="button" onClick={() => setEditingId(t.id)} className="text-primary hover:underline">
                        Edit
                      </button>
                    )}
                    {isAdmin &&
                      (t.deletedAt ? (
                        <button type="button" onClick={() => restore(t)} className="text-primary hover:underline">
                          Restore
                        </button>
                      ) : (
                        <button type="button" onClick={() => remove(t)} className="text-red-600 hover:underline">
                          Delete
                        </button>
                      ))}
                  </div>
                </div>
                <AttachmentList
                  attachments={t.attachments}
                  thumbClass="h-16 w-16"
                  onDelete={canEdit ? deleteAttachment : undefined}
                />
              </li>
            );
          })}
        </ul>
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
            Page {pagination.page} of {pagination.pages} · {pagination.total} total
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

function TransactionForm({
  projectId,
  categories,
  entry,
  onSaved,
  onCancel,
  onDeleteAttachment,
}: {
  projectId: string;
  categories: Category[];
  entry?: Transaction;
  onSaved: () => void;
  onCancel?: () => void;
  onDeleteAttachment?: (id: string) => void;
}) {
  const [categoryId, setCategoryId] = useState(entry?.category.id ?? '');
  const [occurredAt, setOccurredAt] = useState(() =>
    entry ? entry.occurredAt.slice(0, 10) : todayIST(),
  );
  const [amount, setAmount] = useState(entry ? Number(entry.amount).toString() : '');
  const [gstAmount, setGstAmount] = useState(entry ? Number(entry.gstAmount).toString() : '0');
  const [vendor, setVendor] = useState(entry?.vendor ?? '');
  const [paymentMode, setPaymentMode] = useState(entry?.paymentMode ?? 'cash');
  const [description, setDescription] = useState(entry?.description ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCategoryId = categoryId || categories[0]?.id || '';

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
    await api.post(
      `/api/uploads/${presign.attachmentId}/finalize`,
      parentId ? { transactionId: parentId } : {},
    );
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
          { 'Idempotency-Key': crypto.randomUUID() },
        );
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setPending(false);
    }
  }

  if (categories.length === 0) {
    return (
      <div className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">
        Create a category first (Settings) before adding transactions.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-slate-700">Category</span>
          <select
            value={selectedCategoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-slate-700">Date</span>
          <input
            type="date"
            value={occurredAt}
            max={todayIST()}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-700">Amount</span>
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-700">GST</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={gstAmount}
            onChange={(e) => setGstAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-700">Vendor</span>
          <input
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-700">Payment mode</span>
          <select
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-slate-700">Notes</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>

      {entry && entry.attachments.length > 0 && (
        <div>
          <span className="text-sm text-slate-700">Attachments</span>
          <AttachmentList
            attachments={entry.attachments}
            thumbClass="h-16 w-16"
            onDelete={onDeleteAttachment}
          />
        </div>
      )}

      <label className="block text-sm">
        <span className="text-slate-700">{entry ? 'Add a file' : 'Bill photo or file (optional)'}</span>
        <input
          type="file"
          accept="image/*,.pdf,.txt,.csv,.xls,.xlsx"
          capture="environment"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? 'Saving…' : entry ? 'Save changes' : 'Save transaction'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
