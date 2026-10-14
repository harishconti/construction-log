'use client';

import { AlertCircle, RotateCw } from 'lucide-react';
 
import { Button } from './Button';

/** Inline error/info banner with optional retry. */
export function Alert({
  message,
  variant = 'error',
  onRetry,
}: {
  message: string;
  variant?: 'error' | 'info';
  onRetry?: () => void;
}) {
  const tones =
    variant === 'error' ? 'bg-danger-tint text-danger' : 'bg-primary-tint text-primary';
  return (
    <div role={variant === 'error' ? 'alert' : undefined} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${tones}`}>
      <AlertCircle size={18} aria-hidden />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <Button variant="ghost" onClick={onRetry} className="h-8 px-2 text-xs">
          <RotateCw size={14} aria-hidden /> Retry
        </Button>
      )}
    </div>
  );
}
