'use client';

import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  secondary: 'border border-border-strong bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2',
  danger: 'bg-danger text-bg hover:opacity-90',
};

const SIZES: Record<Size, string> = {
  md: 'h-11 px-4 text-sm',
  lg: 'h-[52px] px-5 text-base',
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled, className = '', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading && <Loader2 size={18} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
