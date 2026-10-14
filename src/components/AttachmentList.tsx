'use client';

import { useState } from 'react';
import { Download, FileImage, FileSpreadsheet, FileText, X, type LucideIcon } from 'lucide-react';
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

export function fileTypeIcon(mimeType: string, name: string | null): LucideIcon {
  if (mimeType.startsWith('image/')) return FileImage;
  if (/spreadsheet|excel|csv/.test(mimeType) || /\.(csv|xlsx?)$/i.test(name ?? '')) return FileSpreadsheet;
  return FileText;
}

export function isImage(a: AttachmentItem): boolean {
  return a.viewable && Boolean(a.url);
}

/**
 * Renders attachments: viewable raster images as thumbnails (lightbox), everything else as a download
 * chip with a file-type icon. Non-images are never rendered inline. `onDelete` adds a remove control.
 * `layout="grid"` puts images in a 3-up grid (diary) instead of a wrapping row.
 */
export function AttachmentList({
  attachments,
  thumbClass = 'h-24 w-24',
  layout = 'row',
  onDelete,
}: {
  attachments: AttachmentItem[];
  thumbClass?: string;
  layout?: 'row' | 'grid';
  onDelete?: (id: string) => void;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (attachments.length === 0) return null;

  const images = attachments.filter(isImage);
  const files = attachments.filter((a) => !isImage(a));
  const current = lightboxIndex != null ? images[lightboxIndex] : null;
  const grid = layout === 'grid';

  return (
    <>
      {images.length > 0 && (
        <div className={grid ? 'mt-3 grid grid-cols-3 gap-2' : 'mt-3 flex flex-wrap gap-3'}>
          {images.map((a, i) => (
            <div key={a.id} className="relative">
              <button
                type="button"
                onClick={() => setLightboxIndex(i)}
                aria-label={`View ${a.originalName ?? 'photo'}`}
                className="block w-full overflow-hidden rounded-md"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.url}
                  alt={a.originalName ?? 'Photo'}
                  loading="lazy"
                  className={grid ? 'aspect-square w-full object-cover' : `${thumbClass} object-cover`}
                />
              </button>
              {onDelete && <DeleteChip name={a.originalName} onClick={() => onDelete(a.id)} />}
            </div>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {files.map((a) => {
            const Icon = fileTypeIcon(a.mimeType, a.originalName);
            return (
              <div key={a.id} className="relative max-w-full">
                <a
                  href={a.downloadUrl}
                  className="flex min-h-11 max-w-full items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink hover:border-border-strong"
                >
                  <Icon size={18} aria-hidden className="shrink-0 text-ink-2" />
                  <span className="max-w-[12rem] truncate">{a.originalName ?? 'File'}</span>
                  {a.size != null && <span className="num shrink-0 text-xs text-ink-3">{formatSize(a.size)}</span>}
                  <Download size={16} aria-hidden className="shrink-0 text-primary" />
                  <span className="sr-only">Download</span>
                </a>
                {onDelete && <DeleteChip name={a.originalName} onClick={() => onDelete(a.id)} />}
              </div>
            );
          })}
        </div>
      )}
      <Lightbox
        url={current?.url ?? null}
        caption={current?.originalName ?? undefined}
        position={images.length > 1 && lightboxIndex != null ? `${lightboxIndex + 1} of ${images.length}` : undefined}
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

/** 32 px visible chip inside a 44 px hit area, overlapping the top-right corner. */
function DeleteChip({ name, onClick }: { name: string | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Remove ${name ?? 'attachment'}`}
      className="group absolute -right-3 -top-3 flex h-11 w-11 items-center justify-center"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-danger shadow-e1 ring-1 ring-border group-hover:bg-danger-tint">
        <X size={16} aria-hidden />
      </span>
    </button>
  );
}
