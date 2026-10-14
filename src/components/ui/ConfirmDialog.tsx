'use client';

import { useEffect, useId, useRef } from 'react';
import { Button } from './Button';
import { useFocusTrap } from './useFocusTrap';

/** Accessible confirmation dialog (replaces window.confirm). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();
  useFocusTrap(panelRef, open, cancelRef);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onCancel();
      }
    };
    // Capture so an open Sheet underneath doesn't also close on the same Esc.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={messageId}
    >
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(26,29,33,0.4)' }} onClick={onCancel} />
      <div ref={panelRef} tabIndex={-1} className="relative w-full max-w-sm rounded-lg bg-surface p-5 shadow-e2 outline-none">
        <h2 id={titleId} className="font-display text-lg font-semibold">
          {title}
        </h2>
        <p id={messageId} className="mt-2 text-sm text-ink-2">
          {message}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
