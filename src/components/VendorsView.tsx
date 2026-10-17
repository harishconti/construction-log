'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, ArchiveRestore, HardHat, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatINR } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Sheet } from '@/components/ui/Sheet';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { RowMenu } from '@/components/ui/RowMenu';
import { useToast } from '@/components/ui/Toast';
import { Field, MoneyInput, Textarea, TextInput } from '@/components/ui/inputs';

type Vendor = {
  id: string;
  name: string;
  phone: string | null;
  trade: string | null;
  contractValue: string | null;
  notes: string | null;
  isActive: boolean;
  version: number;
  paid: number;
  transactionCount: number;
  balance: number | null;
};

export function VendorsView({
  projectId,
  role,
  initial,
}: {
  projectId: string;
  role: string;
  initial?: { vendors: Vendor[] };
}) {
  const toast = useToast();
  const [vendors, setVendors] = useState<Vendor[]>(initial?.vendors ?? []);
  const [loading, setLoading] = useState(!initial);
  const usedInitial = useRef(Boolean(initial));
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [sheet, setSheet] = useState<{ open: boolean; vendor: Vendor | null }>({ open: false, vendor: null });
  const [confirm, setConfirm] = useState<{ open: boolean; vendor: Vendor | null }>({ open: false, vendor: null });

  const isAdmin = role === 'admin';
  const canEdit = role === 'admin' || role === 'editor';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ vendors: Vendor[] }>(
        `/api/projects/${projectId}/vendors${showInactive ? '?includeInactive=true' : ''}`,
      );
      setVendors(res.vendors);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vendors');
    } finally {
      setLoading(false);
    }
  }, [projectId, showInactive]);

  useEffect(() => {
    if (usedInitial.current) {
      usedInitial.current = false;
      return;
    }
    void load();
  }, [load]);

  async function toggleActive(v: Vendor) {
    setError(null);
    try {
      await api.patch(`/api/projects/${projectId}/vendors/${v.id}`, { isActive: !v.isActive });
      toast.notify(v.isActive ? 'Vendor deactivated' : 'Vendor activated');
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update vendor');
    }
  }

  async function removeVendor(v: Vendor) {
    setConfirm({ open: false, vendor: null });
    setError(null);
    try {
      await api.delete(`/api/projects/${projectId}/vendors/${v.id}`);
      toast.notify('Vendor deleted');
      void load();
    } catch (err) {
      toast.notify(err instanceof Error ? err.message : 'Failed to delete vendor', 'error');
    }
  }

  const active = vendors.filter((v) => v.isActive);
  const inactive = vendors.filter((v) => !v.isActive);
  const totalPaid = vendors.filter((v) => v.isActive).reduce((s, v) => s + v.paid, 0);

  function row(v: Vendor) {
    return (
      <li key={v.id} className="flex items-center gap-3 p-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-primary-tint text-primary">
          <HardHat size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => canEdit && setSheet({ open: true, vendor: v })}
              className={`truncate text-left font-medium ${canEdit ? 'hover:underline' : ''}`}
            >
              {v.name}
            </button>
            {!v.isActive && (
              <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">Inactive</span>
            )}
          </div>
          <div className="truncate text-sm text-ink-2">
            {[v.trade, v.phone].filter(Boolean).join(' · ') || 'No trade or phone'}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="num font-semibold">{formatINR(v.paid)}</div>
          {v.balance !== null && (
            <div className={`num text-xs ${v.balance < 0 ? 'text-danger' : 'text-ink-3'}`}>
              {v.balance < 0 ? `${formatINR(-v.balance)} over` : `${formatINR(v.balance)} left`}
            </div>
          )}
        </div>
        {canEdit && (
          <div className="flex w-11 shrink-0 justify-center">
            <RowMenu
              label={`Actions for ${v.name}`}
              items={[
                { label: 'Edit', icon: <Pencil size={16} aria-hidden />, onSelect: () => setSheet({ open: true, vendor: v }) },
                {
                  label: v.isActive ? 'Deactivate' : 'Activate',
                  icon: v.isActive ? <Archive size={16} aria-hidden /> : <ArchiveRestore size={16} aria-hidden />,
                  onSelect: () => void toggleActive(v),
                },
                ...(isAdmin && v.transactionCount === 0
                  ? [
                      {
                        label: 'Delete',
                        icon: <Trash2 size={16} aria-hidden />,
                        danger: true,
                        onSelect: () => setConfirm({ open: true, vendor: v }),
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h1 className="font-display text-2xl font-bold lg:text-[28px]">Vendors</h1>
          <span className="num text-sm text-ink-3">{active.length}</span>
        </div>
        {canEdit && (
          <Button onClick={() => setSheet({ open: true, vendor: null })}>
            <Plus size={16} aria-hidden /> Add vendor
          </Button>
        )}
      </div>

      {error && <Alert message={error} onRetry={load} />}

      {active.length > 0 && (
        <p className="text-sm text-ink-2">
          <span className="num font-semibold">{formatINR(totalPaid)}</span> paid across {active.length}{' '}
          {active.length === 1 ? 'vendor' : 'vendors'}.
        </p>
      )}

      {loading && vendors.length === 0 ? (
        <SkeletonRows leading trailing label="Loading vendors" />
      ) : active.length === 0 && (!showInactive || inactive.length === 0) ? (
        <EmptyState
          title="No vendors yet — add your contractors and suppliers to track what you owe each one."
          action={
            canEdit ? (
              <Button onClick={() => setSheet({ open: true, vendor: null })}>
                <Plus size={16} aria-hidden /> Add your first vendor
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">{active.map(row)}</ul>
      )}

      {inactive.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowInactive((v) => !v)}
            aria-expanded={showInactive}
            className="inline-flex min-h-11 items-center gap-1 text-sm text-ink-3 hover:text-ink"
          >
            {showInactive ? 'Hide' : 'Show'} inactive ({inactive.length})
          </button>
          {showInactive && (
            <ul className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
              {inactive.map(row)}
            </ul>
          )}
        </div>
      )}

      {sheet.open && (
        <VendorSheet
          projectId={projectId}
          vendor={sheet.vendor}
          onClose={() => setSheet({ open: false, vendor: null })}
          onSaved={(msg) => {
            toast.notify(msg);
            setSheet({ open: false, vendor: null });
            void load();
          }}
        />
      )}

      <ConfirmDialog
        open={confirm.open}
        title="Delete this vendor?"
        message="This vendor has no transactions, so it can be removed. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirm.vendor && void removeVendor(confirm.vendor)}
        onCancel={() => setConfirm({ open: false, vendor: null })}
      />
    </div>
  );
}

function VendorSheet({
  projectId,
  vendor,
  onClose,
  onSaved,
}: {
  projectId: string;
  vendor: Vendor | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState(vendor?.name ?? '');
  const [trade, setTrade] = useState(vendor?.trade ?? '');
  const [phone, setPhone] = useState(vendor?.phone ?? '');
  const [contractValue, setContractValue] = useState(vendor?.contractValue ? Number(vendor.contractValue).toString() : '');
  const [notes, setNotes] = useState(vendor?.notes ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const payload = {
      name,
      trade: trade || null,
      phone: phone || null,
      contractValue: contractValue === '' ? null : Number(contractValue),
      notes: notes || null,
    };
    try {
      if (vendor) {
        await api.patch(`/api/projects/${projectId}/vendors/${vendor.id}`, { ...payload, version: vendor.version });
        onSaved('Vendor updated');
      } else {
        await api.post(`/api/projects/${projectId}/vendors`, payload);
        onSaved('Vendor added');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save vendor');
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={vendor ? 'Edit vendor' : 'Add vendor'}
      footer={
        <div className="flex flex-1 justify-end gap-2">
          <Button variant="secondary" className="flex-1 md:flex-none" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="vendor-form" className="flex-1 md:flex-none" loading={pending}>
            Save
          </Button>
        </div>
      }
    >
      <form id="vendor-form" onSubmit={submit} className="space-y-3">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sharma Masonry" autoFocus required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Trade" hint="Optional">
            <TextInput value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="Mason" />
          </Field>
          <Field label="Phone" hint="Optional">
            <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Optional" />
          </Field>
        </div>
        <Field label="Contract value" hint="Optional agreed total">
          <MoneyInput value={contractValue} onValueChange={setContractValue} placeholder="0" />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>
        {vendor && (
          <p className="text-sm text-ink-3">
            Paid so far <span className="num font-medium text-ink-2">{formatINR(vendor.paid)}</span> across{' '}
            {vendor.transactionCount} {vendor.transactionCount === 1 ? 'expense' : 'expenses'}.
          </p>
        )}
        {error && <Alert message={error} />}
      </form>
    </Sheet>
  );
}
