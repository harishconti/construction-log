'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Upload } from 'lucide-react';
import { api, newIdempotencyKey } from '@/lib/api-client';
import { todayIST } from '@/lib/period';
import { formatDayLabel } from '@/lib/format';
import { AttachmentList, type AttachmentItem } from '@/components/AttachmentList';
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
}: {
  projectId: string;
  currentUserId: string;
  role: string;
}) {
  const toast = useToast();
  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; entry: Entry | null }>({ open: false, entry: null });
  const [confirm, setConfirm] = useState<{ open: boolean; message: string; run: () => void }>({
    open: false,
    message: '',
    run: () => undefined,
  });

  const isAdmin = role === 'admin';
  const canWrite = role === 'admin' || role === 'editor';

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function requestDelete(entry: Entry) {
    setConfirm({
      open: true,
      message: `Delete “${entry.title}”? This cannot be undone.`,
      run: async () => {
        setConfirm((c) => ({ ...c, open: false }));
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
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Site diary</h1>
        <Button onClick={() => setSheet({ open: true, entry: null })} className="hidden sm:inline-flex">
          <Plus size={16} aria-hidden /> Add entry
        </Button>
      </div>

      {error && <Alert message={error} onRetry={load} />}

      {loading && items.length === 0 ? (
        <SkeletonRows rows={3} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No diary entries yet — log your first site observation."
          action={
            <Button onClick={() => setSheet({ open: true, entry: null })}>
              <Plus size={16} aria-hidden /> Add entry
            </Button>
          }
        />
      ) : (
        <ol className="space-y-3">
          {items.map((e) => {
            const canEditThis = isAdmin || e.createdBy === currentUserId;
            return (
              <li key={e.id} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs text-ink-3">{formatDayLabel(e.entryDate)}</div>
                    <h2 className="mt-1 font-medium">{e.title}</h2>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {canEditThis && (
                      <Button variant="ghost" onClick={() => setSheet({ open: true, entry: e })}>
                        Edit
                      </Button>
                    )}
                    {isAdmin && (
                      <Button variant="ghost" className="text-danger hover:bg-danger-tint" onClick={() => requestDelete(e)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
                {e.body && <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{e.body}</p>}
                <AttachmentList
                  attachments={e.attachments}
                  thumbClass="h-24 w-24"
                  onDelete={canEditThis ? requestDeleteAttachment : undefined}
                />
              </li>
            );
          })}
        </ol>
      )}

      {canWrite && (
        <button
          type="button"
          aria-label="Add diary entry"
          onClick={() => setSheet({ open: true, entry: null })}
          className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-e2 sm:hidden"
          style={{ bottom: 'calc(var(--bottom-nav-h) + 16px)' }}
        >
          <Plus size={26} aria-hidden />
        </button>
      )}

      {sheet.open && (
        <DiarySheet
          projectId={projectId}
          entry={sheet.entry}
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
  onClose,
  onSaved,
  onDeleteAttachment,
}: {
  projectId: string;
  entry: Entry | null;
  onClose: () => void;
  onSaved: (message: string) => void;
  onDeleteAttachment: (id: string) => void;
}) {
  const [entryDate, setEntryDate] = useState(() => (entry ? entry.entryDate.slice(0, 10) : todayIST()));
  const [title, setTitle] = useState(entry?.title ?? '');
  const [body, setBody] = useState(entry?.body ?? '');
  const [files, setFiles] = useState<FileList | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idemKey = useRef<string>(newIdempotencyKey());
  const uploadRef = useRef<HTMLInputElement>(null);

  async function uploadFile(f: File, parentId?: string): Promise<string> {
    const presign = await api.post<{ uploadUrl: string; attachmentId: string }>('/api/uploads/presign', {
      projectId,
      parentType: 'diary_entry',
      filename: f.name,
      mimeType: f.type,
      size: f.size,
    });
    const put = await fetch(presign.uploadUrl, { method: 'PUT', body: f, headers: { 'Content-Type': f.type } });
    if (!put.ok) throw new Error('Upload failed');
    await api.post(`/api/uploads/${presign.attachmentId}/finalize`, parentId ? { diaryEntryId: parentId } : {});
    return presign.attachmentId;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (entry) {
        await api.patch(`/api/projects/${projectId}/diary/${entry.id}`, {
          entryDate: new Date(entryDate).toISOString(),
          title,
          body,
          version: entry.version,
        });
        if (files) for (const f of Array.from(files)) await uploadFile(f, entry.id);
        onSaved('Entry updated');
      } else {
        const attachmentIds: string[] = [];
        if (files) for (const f of Array.from(files)) attachmentIds.push(await uploadFile(f));
        await api.post(
          `/api/projects/${projectId}/diary`,
          { entryDate: new Date(entryDate).toISOString(), title, body, attachmentIds },
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
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="diary-form" className="flex-1" loading={pending}>
            Save
          </Button>
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
            <AttachmentList attachments={entry.attachments} onDelete={onDeleteAttachment} />
          </div>
        )}

        <div>
          <span className="text-[13px] font-semibold text-ink-2">{entry ? 'Add photos/files' : 'Photos & files'}</span>
          <div className="mt-1">
            <Button type="button" variant="secondary" onClick={() => uploadRef.current?.click()}>
              <Upload size={16} aria-hidden /> Choose files
            </Button>
          </div>
          <input
            ref={uploadRef}
            type="file"
            accept="image/*,.pdf,.txt,.csv,.xls,.xlsx"
            multiple
            className="hidden"
            onChange={(e) => setFiles(e.target.files)}
          />
          <p className="mt-1 text-xs text-ink-3">Images open in the app; PDFs and spreadsheets download only.</p>
        </div>

        {error && <Alert message={error} />}
      </form>
    </Sheet>
  );
}
