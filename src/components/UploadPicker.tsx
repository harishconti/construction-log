'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, FileSpreadsheet, FileText, RotateCw, Upload, X } from 'lucide-react';
import { api } from '@/lib/api-client';
import { compressForUpload } from '@/lib/image-compress';
import { Button } from '@/components/ui/Button';

export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPT = 'image/*,.pdf,.txt,.csv,.xls,.xlsx';

type ParentType = 'transaction' | 'diary_entry' | 'funding';
type Status = 'compressing' | 'uploading' | 'uploaded' | 'error';

export type PendingUpload = {
  key: string;
  file: File;
  previewUrl: string | null;
  progress: number;
  status: Status;
  error?: string;
  attachmentId?: string;
};

function putWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Upload failed')));
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(file);
  });
}

/**
 * Upload queue: each file is presigned and PUT as soon as it is picked (with progress and retry).
 * `finalizeAll` runs on save, linking to `parentId` when editing an existing record.
 */
export function useUploads(projectId: string, parentType: ParentType, existingCount = 0) {
  const [items, setItems] = useState<PendingUpload[]>([]);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(
    () => () => {
      for (const i of itemsRef.current) if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
    },
    [],
  );

  const patch = useCallback((key: string, next: Partial<PendingUpload>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...next } : i)));
  }, []);

  const start = useCallback(
    async (item: PendingUpload) => {
      patch(item.key, { status: 'compressing', progress: 0, error: undefined });
      try {
        // Optimise in the browser first: a phone photo shrinks from many MB to a few hundred KB before
        // it ever leaves the device. The server re-checks and re-compresses at finalize as a backstop.
        const file = await compressForUpload(item.file);
        if (file !== item.file) patch(item.key, { file });
        patch(item.key, { status: 'uploading' });
        const presign = await api.post<{ uploadUrl: string; attachmentId: string }>('/api/uploads/presign', {
          projectId,
          parentType,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
        });
        await putWithProgress(presign.uploadUrl, file, (progress) => patch(item.key, { progress }));
        patch(item.key, { status: 'uploaded', progress: 100, attachmentId: presign.attachmentId });
      } catch (err) {
        patch(item.key, { status: 'error', error: err instanceof Error ? err.message : 'Upload failed' });
      }
    },
    [projectId, parentType, patch],
  );

  /** Returns a message when some files were skipped. */
  const add = useCallback(
    (list: FileList | File[]): string | null => {
      const files = Array.from(list);
      const room = Math.max(0, MAX_FILES - existingCount - itemsRef.current.length);
      const tooBig = files.filter((f) => f.size > MAX_FILE_BYTES);
      const ok = files.filter((f) => f.size <= MAX_FILE_BYTES).slice(0, room);
      const created: PendingUpload[] = ok.map((file) => ({
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        progress: 0,
        status: 'uploading',
      }));
      setItems((prev) => [...prev, ...created]);
      for (const c of created) void start(c);
      const skipped = files.length - ok.length;
      if (!skipped) return null;
      if (tooBig.length) return `${tooBig.length} file(s) over 10 MB were skipped.`;
      return `Only ${MAX_FILES} files per record — ${skipped} skipped.`;
    },
    [existingCount, start],
  );

  const remove = useCallback((key: string) => {
    setItems((prev) => {
      const gone = prev.find((i) => i.key === key);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((i) => i.key !== key);
    });
  }, []);

  const retry = useCallback(
    (key: string) => {
      const item = itemsRef.current.find((i) => i.key === key);
      if (item) void start(item);
    },
    [start],
  );

  const busy = items.some((i) => i.status === 'uploading' || i.status === 'compressing');
  const failed = items.some((i) => i.status === 'error');

  /** Finalize every uploaded file; returns their attachment ids. */
  const finalizeAll = useCallback(
    async (link?: { transactionId: string } | { diaryEntryId: string } | { fundingId: string }): Promise<string[]> => {
      const ids: string[] = [];
      for (const i of itemsRef.current) {
        if (i.status !== 'uploaded' || !i.attachmentId) continue;
        await api.post(`/api/uploads/${i.attachmentId}/finalize`, link ?? {});
        ids.push(i.attachmentId);
      }
      return ids;
    },
    [],
  );

  return { items, add, remove, retry, busy, failed, finalizeAll, room: MAX_FILES - existingCount - items.length };
}

function fileIcon(name: string) {
  return /\.(csv|xlsx?)$/i.test(name) ? FileSpreadsheet : FileText;
}

/** Camera + Upload buttons, thumbnails, per-file progress and retry. */
export function UploadPicker({
  label,
  uploads,
  camera = true,
  onMessage,
}: {
  label: string;
  uploads: ReturnType<typeof useUploads>;
  camera?: boolean;
  onMessage?: (message: string) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const full = uploads.room <= 0;

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) {
      const msg = uploads.add(e.target.files);
      if (msg) onMessage?.(msg);
    }
    e.target.value = '';
  }

  return (
    <div>
      <span className="text-[13px] font-semibold text-ink-2">{label}</span>
      <div className="mt-1 flex flex-wrap gap-2">
        {camera && (
          <Button type="button" variant="secondary" disabled={full} onClick={() => cameraRef.current?.click()}>
            <Camera size={16} aria-hidden /> Camera
          </Button>
        )}
        <Button type="button" variant="secondary" disabled={full} onClick={() => uploadRef.current?.click()}>
          <Upload size={16} aria-hidden /> Upload
        </Button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
      <input ref={uploadRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={onPick} />
      <p className="mt-1 text-xs text-ink-3">Up to {MAX_FILES} files, 10 MB each. Photos are compressed automatically. Images open in the app; PDFs and spreadsheets download.</p>

      {uploads.items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {uploads.items.map((i) => {
            const Icon = fileIcon(i.file.name);
            return (
              <li key={i.key} className="flex items-center gap-3 rounded-md border border-border p-2">
                {i.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.previewUrl} alt="" className="h-11 w-11 shrink-0 rounded-sm object-cover" />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink-2">
                    <Icon size={20} aria-hidden />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{i.file.name}</p>
                  {i.status === 'error' ? (
                    <p className="text-xs text-danger">{i.error ?? 'Upload failed'}</p>
                  ) : (
                    <>
                      {i.status === 'compressing' && <p className="text-xs text-ink-3">Optimising…</p>}
                      <div
                        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
                        role="progressbar"
                        aria-label={`Uploading ${i.file.name}`}
                        aria-valuenow={i.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="h-full rounded-full transition-[width]"
                          style={{ width: `${i.progress}%`, backgroundColor: i.status === 'uploaded' ? 'var(--ok)' : 'var(--primary)' }}
                        />
                      </div>
                    </>
                  )}
                </div>
                {i.status === 'error' && (
                  <button
                    type="button"
                    onClick={() => uploads.retry(i.key)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-primary hover:bg-primary-tint"
                    aria-label={`Retry ${i.file.name}`}
                  >
                    <RotateCw size={16} aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => uploads.remove(i.key)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2"
                  aria-label={`Remove ${i.file.name}`}
                >
                  <X size={16} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
