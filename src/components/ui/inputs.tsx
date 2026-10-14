'use client';

import { useId } from 'react';

const CONTROL =
  'w-full rounded-md border border-border-strong bg-surface px-3 text-base text-ink placeholder:text-ink-3 md:text-sm';

function wrapperClass(className: string) {
  return `${CONTROL} h-11 ${className}`;
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-sm">
      <label htmlFor={htmlFor} className="mb-1 block text-[13px] font-semibold text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({
  className = '',
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={wrapperClass(className)} {...rest} />;
}

export function DateInput({
  className = '',
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="date" className={wrapperClass(className)} {...rest} />;
}

export function Textarea({
  className = '',
  rows = 3,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={`${CONTROL} py-2 ${className}`} {...rest} />;
}

export function Select({
  className = '',
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={wrapperClass(className)} {...rest}>
      {children}
    </select>
  );
}

/** Money input: decimal keypad, ₹ prefix, digit grouping on blur. */
export function MoneyInput({
  value,
  onValueChange,
  className = '',
  placeholder,
  ...rest
}: {
  value: string;
  onValueChange: (v: string) => void;
  className?: string;
  placeholder?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const id = useId();
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden>
        ₹
      </span>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onValueChange(e.target.value.replace(/[^0-9.]/g, ''))}
        onBlur={() => {
          const n = Number(value);
          if (Number.isFinite(n) && value !== '') onValueChange(n.toFixed(2).replace(/\.00$/, ''));
        }}
        className={`${wrapperClass(className)} num pl-7 text-right`}
        {...rest}
      />
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" className="inline-flex rounded-md bg-surface-2 p-1 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-9 rounded px-3 ${value === o.value ? 'bg-surface font-semibold text-ink shadow-e1' : 'text-ink-2'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
