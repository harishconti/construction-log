'use client';

import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { IconButton } from './IconButton';

/** Accessible image viewer: focus management, scroll lock, optional prev/next and caption. */
export function Lightbox({
  url,
  caption,
  onClose,
  onPrev,
  onNext,
}: {
  url: string | null;
  caption?: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!url) return;
    const prev = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev?.();
      if (e.key === 'ArrowRight') onNext?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [url, onClose, onPrev, onNext]);

  if (!url) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label={caption ?? 'Image'} className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}>
      <div className="absolute right-4 top-4 flex gap-2" style={{ top: 'calc(1rem + env(safe-area-inset-top))' }}>
        <IconButton ref={closeRef} label="Close" onClick={onClose} className="bg-white/90 text-ink hover:bg-white">
          <X size={20} />
        </IconButton>
      </div>

      {onPrev && (
        <button type="button" aria-label="Previous" onClick={onPrev} className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/80 text-ink hover:bg-white">
          <ChevronLeft size={22} />
        </button>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={caption ?? ''} className="max-h-[80dvh] max-w-full rounded-lg object-contain" />
      {onNext && (
        <button type="button" aria-label="Next" onClick={onNext} className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/80 text-ink hover:bg-white">
          <ChevronRight size={22} />
        </button>
      )}

      {caption && <p className="mt-3 max-w-lg text-center text-sm text-white/90">{caption}</p>}
    </div>
  );
}
