'use client';

import { useState } from 'react';
import { Lightbox } from '@/components/ui/Lightbox';

export type AttachmentItem = {
  id: string;
  mimeType: string;
  viewable: boolean;
  url: string;
  downloadUrl: string;
  originalName: string | null;
  size: number | null;
};

function formatSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Renders attachments: viewable raster images as clickable thumbnails (lightbox), everything
 * else as a download chip. Non-images are never rendered inline. Optional `onDelete` adds a remove control.
 */
export function AttachmentList({
  attachments,
  thumbClass = 'h-24 w-24',
  onDelete,
}: {
  attachments: AttachmentItem[];
  thumbClass?: string;
  onDelete?: (id: string) => void;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (attachments.length === 0) return null;

  const images = attachments.filter((a) => a.viewable && a.url);
  const files = attachments.filter((a) => !(a.viewable && a.url));
  const current = lightboxIndex != null ? images[lightboxIndex] : null;

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-3">
        {images.map((a, i) => (
          <div key={a.id} className="relative">
            <button type="button" onClick={() => setLightboxIndex(i)} className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt={a.originalName ?? ''} className={`${thumbClass} rounded-lg object-cover`} />
            </button>
            {onDelete && <DeleteChip onClick={() => onDelete(a.id)} />}
          </div>
        ))}
        {files.map((a) => (
          <div key={a.id} className="relative">
            <a
              href={a.downloadUrl}
              className="flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm hover:bg-slate-100"
            >
              <span className="max-w-[12rem] truncate">{a.originalName ?? 'file'}</span>
              {a.size != null && <span className="text-xs text-slate-400">{formatSize(a.size)}</span>}
              <span className="text-primary">Download</span>
            </a>
            {onDelete && <DeleteChip onClick={() => onDelete(a.id)} />}
          </div>
        ))}
      </div>
      <Lightbox
        url={current?.url ?? null}
        caption={current?.originalName ?? undefined}
        onClose={() => setLightboxIndex(null)}
        onPrev={lightboxIndex != null && lightboxIndex > 0 ? () => setLightboxIndex((i) => (i ?? 0) - 1) : undefined}
        onNext={
          lightboxIndex != null && lightboxIndex < images.length - 1
            ? () => setLightboxIndex((i) => (i ?? 0) + 1)
            : undefined
        }
      />
    </>
  );
}

function DeleteChip({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove attachment"
      className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs text-red-600 shadow ring-1 ring-slate-200 hover:bg-red-50"
    >
      ×
    </button>
  );
}
