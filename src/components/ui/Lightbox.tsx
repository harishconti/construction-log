'use client';

import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { IconButton } from './IconButton';
import { useFocusTrap } from './useFocusTrap';

const SWIPE_MIN_PX = 50;

/** Accessible image viewer: focus trap, scroll lock, prev/next (buttons, arrows, swipe) and caption. */
export function Lightbox({
  url,
  caption,
  position,
  onClose,
  onPrev,
  onNext,
}: {
  url: string | null;
  caption?: string;
  /** e.g. "2 of 5" */
  position?: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const open = Boolean(url);
  useFocusTrap(dialogRef, open, closeRef);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev?.();
      if (e.key === 'ArrowRight') onNext?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, onPrev, onNext]);

  if (!url) return null;

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e: React.TouchEvent) {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) onNext?.();
      else onPrev?.();
    } else if (dy > SWIPE_MIN_PX * 2 && Math.abs(dy) > Math.abs(dx)) {
      onClose(); // swipe down to dismiss
    }
  }

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={caption ?? 'Image'}
      className="fixed inset-0 z-[60] flex touch-pan-y flex-col items-center justify-center p-4 outline-none"
      style={{ backgroundColor: 'rgba(0,0,0,0.88)' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="absolute right-4 flex items-center gap-3" style={{ top: 'calc(1rem + env(safe-area-inset-top))' }}>
        {position && <span className="num text-sm text-white/90">{position}</span>}
        <IconButton ref={closeRef} label="Close" onClick={onClose} className="bg-white/90 !text-[#1a1d21] hover:bg-white">
          <X size={20} />
        </IconButton>
      </div>

      {onPrev && (
        <button
          type="button"
          aria-label="Previous image"
          onClick={onPrev}
          className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/80 text-[#1a1d21] hover:bg-white"
        >
          <ChevronLeft size={22} />
        </button>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={caption ?? 'Attachment'} draggable={false} className="max-h-[80dvh] max-w-full select-none rounded-lg object-contain" />
      {onNext && (
        <button
          type="button"
          aria-label="Next image"
          onClick={onNext}
          className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/80 text-[#1a1d21] hover:bg-white"
        >
          <ChevronRight size={22} />
        </button>
      )}

      {caption && <p className="mt-3 max-w-lg break-all text-center text-sm text-white/90">{caption}</p>}
    </div>
  );
}
