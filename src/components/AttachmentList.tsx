'use client';

import { useState } from 'react';
import { Lightbox } from '@/components/Lightbox';

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
 * else as a download chip. Non-images are never rendered inline.
 */
export function AttachmentList({
  attachments,
  thumbClass = 'h-24 w-24',
}: {
  attachments: AttachmentItem[];
  thumbClass?: string;
}) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  if (attachments.length === 0) return null;

  const images = attachments.filter((a) => a.viewable && a.url);
  const files = attachments.filter((a) => !(a.viewable && a.url));

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {images.map((a) => (
          <button key={a.id} type="button" onClick={() => setLightbox(a.url)} className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.url} alt={a.originalName ?? ''} className={`${thumbClass} rounded-lg object-cover`} />
          </button>
        ))}
        {files.map((a) => (
          <a
            key={a.id}
            href={a.downloadUrl}
            className="flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm hover:bg-slate-100"
          >
            <span className="max-w-[12rem] truncate">{a.originalName ?? 'file'}</span>
            {a.size != null && <span className="text-xs text-slate-400">{formatSize(a.size)}</span>}
            <span className="text-primary">Download</span>
          </a>
        ))}
      </div>
      <Lightbox url={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
}
