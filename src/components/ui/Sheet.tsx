'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';
import { useFocusTrap } from './useFocusTrap';

/** Bottom sheet on mobile, right drawer at md+. Esc / scrim close, body scroll lock, focus trap. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(26,29,33,0.4)' }} onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 flex max-h-[90dvh] flex-col overflow-hidden rounded-t-sheet bg-surface shadow-e2 outline-none md:inset-y-0 md:left-auto md:right-0 md:h-full md:max-h-none md:w-[440px] md:rounded-none"
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong md:hidden" aria-hidden />
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
          <h2 id={titleId} className="font-display text-lg font-semibold">
            {title}
          </h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && (
          <div
            className="shrink-0 border-t border-border bg-surface p-4"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
