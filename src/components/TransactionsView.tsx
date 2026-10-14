'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api-client';

type Category = { id: string; name: string; type: string };
type Attachment = { id: string; url: string; mimeType: string };
type Transaction = {
  id: string;
  occurredAt: string;
  amount: string;
  gstAmount: string;
  vendor: string | null;
  paymentMode: string;
  description: string | null;
  category: { id: string; name: string };
  attachments: Attachment[];
};

const PAYMENT_MODES = ['cash', 'upi', 'bank', 'card', 'credit'];

export function TransactionsView({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [txRes, catRes] = await Promise.all([
        api.get<{ items: Transaction[] }>(`/api/projects/${projectId}/transactions`),
        api.get<{ categories: Category[] }>(`/api/projects/${projectId}/categories`),
      ]);
      setItems(txRes.items);
      setCategories(catRes.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Transactions</h1>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white"
        >
          {showForm ? 'Close' : 'Add'}
        </button>
      </div>

      {showForm && (
        <TransactionForm
          projectId={projectId}
          categories={categories}
          onCreated={() => {
            setShowForm(false);
            void load();
          }}
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No transactions yet — add your first expense.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm">
          {items.map((t) => (
            <li key={t.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <div className="font-medium">
                  {new Date(t.occurredAt).toLocaleDateString()} · {t.category.name}
                </div>
                <div className="text-slate-500">
                  {[t.vendor, t.paymentMode].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="text-right">
                <div className="font-medium">₹{Number(t.amount).toLocaleString('en-IN')}</div>
                {t.attachments.length > 0 && (
                  <div className="text-xs text-slate-400">{t.attachments.length} photo(s)</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TransactionForm({
  projectId,
  categories,
  onCreated,
}: {
  projectId: string;
  categories: Category[];
  onCreated: () => void;
}) {
  const [categoryId, setCategoryId] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [gstAmount, setGstAmount] = useState('0');
  const [vendor, setVendor] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCategoryId = categoryId || categories[0]?.id || '';

  async function uploadPhoto(f: File): Promise<string> {
    const presign = await api.post<{ uploadUrl: string; fileKey: string }>('/api/uploads/presign', {
      projectId,
      parentType: 'transaction',
      mimeType: f.type,
      size: f.size,
    });
    const put = await fetch(presign.uploadUrl, {
      method: 'PUT',
      body: f,
      headers: { 'Content-Type': f.type },
    });
    if (!put.ok) throw new Error('Photo upload failed');
    return presign.fileKey;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const fileKeys: string[] = [];
      if (file && file.type.startsWith('image/')) {
        try {
          fileKeys.push(await uploadPhoto(file));
        } catch (uploadErr) {
          setError(uploadErr instanceof Error ? uploadErr.message : 'Photo upload failed');
          return;
        }
      }

      await api.post(`/api/projects/${projectId}/transactions`, {
        categoryId: selectedCategoryId,
        occurredAt: new Date(occurredAt).toISOString(),
        amount: Number(amount),
        gstAmount: Number(gstAmount || 0),
        vendor: vendor || null,
        paymentMode,
        description: description || null,
        fileKeys,
      });
      onCreated();
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
            max={new Date().toISOString().slice(0, 10)}
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

      <label className="block text-sm">
        <span className="text-slate-700">Bill photo (optional)</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Save transaction'}
      </button>
    </form>
  );
}
