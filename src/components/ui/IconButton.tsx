'use client';

import { forwardRef } from 'react';

export type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: 'ghost' | 'danger';
};

/** 44×44 icon button. `label` is required and used as the accessible name. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', className = '', children, ...rest },
  ref,
) {
  const colors = variant === 'danger' ? 'text-danger hover:bg-danger-tint' : 'text-ink-2 hover:bg-surface-2';
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-md ${colors} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});
