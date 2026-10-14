'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, newIdempotencyKey } from '@/lib/api-client';
import { todayIST } from '@/lib/period';
import { AttachmentList, type AttachmentItem } from '@/components/AttachmentList';

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
  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  async function remove(entry: Entry) {
    if (!window.confirm('Delete this diary entry? This cannot be undone.')) return;
    setError(null);
    try {
      await api.delete(`/api/projects/${projectId}/diary/${entry.id}`);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Site diary</h1>
        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setShowForm((v) => !v);
          }}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white"
        >
          {showForm ? 'Close' : 'Add entry'}
        </button>
      </div>

      {showForm && (
        <DiaryForm
          projectId={projectId}
          onSaved={() => {
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
          No diary entries yet — log your first site observation.
        </div>
      ) : (
        <ol className="space-y-3">
          {items.map((e) => {
            const canEditThis = isAdmin || e.createdBy === currentUserId;
            if (editingId === e.id) {
              return (
                <li key={e.id}>
                  <DiaryForm
                    projectId={projectId}
                    entry={e}
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
              <li key={e.id} className="rounded-xl bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-slate-500">{new Date(e.entryDate).toLocaleDateString()}</div>
                    <h2 className="mt-1 font-medium">{e.title}</h2>
                  </div>
                  {canEditThis && (
                    <div className="flex shrink-0 gap-2 text-sm">
                      <button type="button" onClick={() => setEditingId(e.id)} className="text-primary hover:underline">
                        Edit
                      </button>
                      {isAdmin && (
                        <button type="button" onClick={() => remove(e)} className="text-red-600 hover:underline">
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {e.body && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{e.body}</p>}
                <AttachmentList
                  attachments={e.attachments}
                  onDelete={canEditThis ? deleteAttachment : undefined}
                />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function DiaryForm({
  projectId,
  entry,
  onSaved,
  onCancel,
  onDeleteAttachment,
}: {
  projectId: string;
  entry?: Entry;
  onSaved: () => void;
  onCancel?: () => void;
  onDeleteAttachment?: (id: string) => void;
}) {
  const [entryDate, setEntryDate] = useState(() =>
    entry ? entry.entryDate.slice(0, 10) : todayIST(),
  );
  const [title, setTitle] = useState(entry?.title ?? '');
  const [body, setBody] = useState(entry?.body ?? '');
  const [files, setFiles] = useState<FileList | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idemKey = useRef<string>(newIdempotencyKey());

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
    await api.post(
      `/api/uploads/${presign.attachmentId}/finalize`,
      parentId ? { diaryEntryId: parentId } : {},
    );
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
      } else {
        const attachmentIds: string[] = [];
        if (files) for (const f of Array.from(files)) attachmentIds.push(await uploadFile(f));
        await api.post(
          `/api/projects/${projectId}/diary`,
          { entryDate: new Date(entryDate).toISOString(), title, body, attachmentIds },
          { 'Idempotency-Key': idemKey.current },
        );
        idemKey.current = newIdempotencyKey();
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
      <label className="block text-sm">
        <span className="text-slate-700">Date</span>
        <input
          type="date"
          value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-slate-700">Title</span>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-slate-700">Notes</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>

      {entry && entry.attachments.length > 0 && (
        <div>
          <span className="text-sm text-slate-700">Attachments</span>
          <AttachmentList attachments={entry.attachments} onDelete={onDeleteAttachment} />
        </div>
      )}

      <label className="block text-sm">
        <span className="text-slate-700">{entry ? 'Add photos/files' : 'Photos & files (up to 10)'}</span>
        <input
          type="file"
          accept="image/*,.pdf,.txt,.csv,.xls,.xlsx"
          capture="environment"
          multiple
          onChange={(e) => setFiles(e.target.files)}
          className="mt-1 block w-full text-sm"
        />
        <span className="mt-1 block text-xs text-slate-400">
          Images open in the app; PDF/text/spreadsheet files download only.
        </span>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? 'Saving…' : entry ? 'Save changes' : 'Save entry'}
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
