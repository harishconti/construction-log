'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, newIdempotencyKey } from '@/lib/api-client';
import { todayIST } from '@/lib/period';
import { formatDayLabel } from '@/lib/format';
import { AttachmentList, type AttachmentItem } from '@/components/AttachmentList';
import { UploadPicker, useUploads } from '@/components/UploadPicker';
import { IconButton } from '@/components/ui/IconButton';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Alert } from '@/components/ui/Alert';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { DateInput, Field, TextInput, Textarea } from '@/components/ui/inputs';

type Entry = {
  id: string;
  entryDate: string;
  title: string;
  body: string;
  createdBy: string;
  version: number;
  attachments: AttachmentItem[];
};

export function DiaryView({
  projectId,
  currentUserId,
  role,
  initial,
}: {
  projectId: string;
  currentUserId: string;
  role: string;
  /** First entries rendered with the page, so there is no fetch on arrival. */
  initial?: { items: Entry[] };
}) {
  const toast = useToast();
  const [items, setItems] = useState<Entry[]>(initial?.items ?? []);
  const [loading, setLoading] = useState(!initial);
  const usedInitial = useRef(Boolean(initial));
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; entry: Entry | null }>({ open: false, entry: null });
  const [confirm, setConfirm] = useState<{ open: boolean; message: string; run: () => void }>({
    open: false,
    message: '',
    run: () => undefined,
  });

  const [highlight, setHighlight] = useState<string | null>(null);

  const isAdmin = role === 'admin';
  const canWrite = role === 'admin' || role === 'editor';
  // Editors may change their own entries; admins any entry. Viewers never.
  const canEditEntry = (e: Entry) => canWrite && (isAdmin || e.createdBy === currentUserId);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ items: Entry[] }>(`/api/projects/${projectId}/diary`);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // The server already rendered the first entries; later reloads (after edits) still fetch.
    if (usedInitial.current) {
      usedInitial.current = false;
      return;
    }
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const out: { key: string; label: string; entries: Entry[] }[] = [];
    for (const e of items) {
      const key = todayIST(new Date(e.entryDate));
      let g = out.find((x) => x.key === key);
      if (!g) {
        g = { key, label: formatDayLabel(e.entryDate), entries: [] };
        out.push(g);
      }
      g.entries.push(e);
    }
    return out;
  }, [items]);

  // Deep link from the dashboard: /diary#entry-<id>.
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current || items.length === 0) return;
    const match = window.location.hash.match(/^#entry-(.+)$/);
    if (!match) return;
    linked.current = true;
    const id = decodeURIComponent(match[1]);
    if (!items.some((e) => e.id === id)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHighlight(id);
    requestAnimationFrame(() => document.getElementById(`entry-${id}`)?.scrollIntoView({ block: 'center' }));
    const t = setTimeout(() => setHighlight(null), 2500);
    return () => clearTimeout(t);
  }, [items]);

  function requestDelete(entry: Entry) {
    setConfirm({
      open: true,
      message: `Delete “${entry.title}”? This cannot be undone.`,
      run: async () => {
        setConfirm((c) => ({ ...c, open: false }));
        setSheet({ open: false, entry: null });
        try {
          await api.delete(`/api/projects/${projectId}/diary/${entry.id}`);
          toast.notify('Entry deleted');
          void load();
        } catch (err) {
          toast.notify(err instanceof Error ? err.message : 'Failed to delete', 'error');
        }
      },
    });
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold lg:text-[28px]">Site diary</h1>
        {canWrite && (
          <Button onClick={() => setSheet({ open: true, entry: null })} className="hidden md:inline-flex">
            <Plus size={16} aria-hidden /> Add entry
          </Button>
        )}
      </div>

      {error && <Alert message={error} onRetry={load} />}

      {loading && items.length === 0 ? (
        <SkeletonRows rows={3} label="Loading diary" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No diary entries yet — log your first site observation."
          action={
            canWrite ? (
              <Button onClick={() => setSheet({ open: true, entry: null })}>
                <Plus size={16} aria-hidden /> Add entry
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`day-${g.key}`}>
              <h2 id={`day-${g.key}`} className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-2">
                <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />
                {g.label}
              </h2>
              <ol className="ml-[4px] space-y-3 border-l-2 border-border pl-4">
                {g.entries.map((e) => {
                  const editable = canEditEntry(e);
                  return (
                    <li
                      key={e.id}
                      id={`entry-${e.id}`}
                      className={`rounded-lg border bg-surface p-4 transition-colors ${
                        highlight === e.id ? 'border-primary bg-primary-tint' : 'border-border'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="min-w-0 pt-2.5 font-medium [overflow-wrap:anywhere]">{e.title}</h3>
                        {editable && (
                          <IconButton label={`Edit ${e.title}`} onClick={() => setSheet({ open: true, entry: e })} className="-mr-2 -mt-1 shrink-0">
                            <Pencil size={18} />
                          </IconButton>
                        )}
                      </div>
                      {e.body && <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2 [overflow-wrap:anywhere]">{e.body}</p>}
                      <div className="md:max-w-xl">
                        <AttachmentList attachments={e.attachments} layout="grid" />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      {/* Keeps the last entry clear of the floating Add button. */}
      {canWrite && <div aria-hidden className="h-20 md:hidden" />}

      {canWrite && (
        <button
          type="button"
          aria-label="Add diary entry"
          onClick={() => setSheet({ open: true, entry: null })}
          className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-e2 md:hidden"
          style={{ bottom: 'calc(var(--bottom-nav-h) + 16px)' }}
        >
          <Plus size={26} aria-hidden />
        </button>
      )}

      {sheet.open && (
        <DiarySheet
          projectId={projectId}
          entry={sheet.entry}
          canDelete={isAdmin}
          onDelete={requestDelete}
          onMessage={(m) => toast.notify(m, 'info')}
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

function DiarySheet({
  projectId,
  entry,
  canDelete,
  onDelete,
  onMessage,
  onClose,
  onSaved,
  onDeleteAttachment,
}: {
  projectId: string;
  entry: Entry | null;
  canDelete: boolean;
  onDelete: (entry: Entry) => void;
  onMessage: (message: string) => void;
  onClose: () => void;
  onSaved: (message: string) => void;
  onDeleteAttachment: (id: string) => void;
}) {
  const [entryDate, setEntryDate] = useState(() => (entry ? todayIST(new Date(entry.entryDate)) : todayIST()));
  const [title, setTitle] = useState(entry?.title ?? '');
  const [body, setBody] = useState(entry?.body ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idemKey = useRef<string>(newIdempotencyKey());
  const uploads = useUploads(projectId, 'diary_entry', entry?.attachments.length ?? 0);

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
        await api.patch(`/api/projects/${projectId}/diary/${entry.id}`, {
          entryDate, // bare YYYY-MM-DD: the server reads it as an IST calendar date
          title,
          body,
          version: entry.version,
        });
        await uploads.finalizeAll({ diaryEntryId: entry.id });
        onSaved('Entry updated');
      } else {
        const attachmentIds = await uploads.finalizeAll();
        await api.post(
          `/api/projects/${projectId}/diary`,
          { entryDate, title, body, attachmentIds },
          { 'Idempotency-Key': idemKey.current },
        );
        idemKey.current = newIdempotencyKey();
        onSaved('Entry added');
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
      title={entry ? 'Edit diary entry' : 'New diary entry'}
      footer={
        <div className="flex gap-2">
          {entry && canDelete && (
            <Button variant="ghost" className="text-danger hover:bg-danger-tint" onClick={() => onDelete(entry)}>
              <Trash2 size={16} aria-hidden /> Delete
            </Button>
          )}
          <div className="flex flex-1 justify-end gap-2">
            <Button variant="secondary" className="flex-1 md:flex-none" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="diary-form" className="flex-1 md:flex-none" loading={pending} disabled={uploads.busy}>
              Save
            </Button>
          </div>
        </div>
      }
    >
      <form id="diary-form" onSubmit={submit} className="space-y-3">
        <Field label="Date">
          <DateInput value={entryDate} max={todayIST()} onChange={(e) => setEntryDate(e.target.value)} required />
        </Field>
        <Field label="Title">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label="Notes">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} />
        </Field>

        {entry && entry.attachments.length > 0 && (
          <div>
            <span className="text-[13px] font-semibold text-ink-2">Attachments</span>
            <AttachmentList attachments={entry.attachments} thumbClass="h-16 w-16" onDelete={onDeleteAttachment} />
          </div>
        )}

        <UploadPicker label={entry ? 'Add photos or files' : 'Photos and files'} uploads={uploads} onMessage={onMessage} />

        {error && <Alert message={error} />}
      </form>
    </Sheet>
  );
}
