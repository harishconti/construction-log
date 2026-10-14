'use client';

import { createContext, useContext, useId } from 'react';

/** Lets a control inside `Field` pick up the label's `for` id and the hint/error description. */
const FieldContext = createContext<{ id: string; labelId: string; describedBy?: string; invalid: boolean } | null>(null);

function useFieldProps(id?: string, describedBy?: string) {
  const ctx = useContext(FieldContext);
  return {
    id: id ?? ctx?.id,
    'aria-describedby': describedBy ?? ctx?.describedBy,
    'aria-invalid': ctx?.invalid || undefined,
  };
}

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
  const autoId = useId();
  const id = htmlFor ?? `${autoId}-control`;
  const labelId = `${autoId}-label`;
  const descId = `${autoId}-desc`;
  const describedBy = error || hint ? descId : undefined;
  return (
    <FieldContext.Provider value={{ id, labelId, describedBy, invalid: Boolean(error) }}>
      <div className="text-sm">
        <label id={labelId} htmlFor={id} className="mb-1 block text-[13px] font-semibold text-ink-2">
          {label}
        </label>
        {children}
        {error ? (
          <p id={descId} className="mt-1 text-xs text-danger">
            {error}
          </p>
        ) : hint ? (
          <p id={descId} className="mt-1 text-xs text-ink-3">
            {hint}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

export function TextInput({
  className = '',
  id,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const field = useFieldProps(id, rest['aria-describedby']);
  return <input className={wrapperClass(className)} {...rest} {...field} />;
}

export function DateInput({
  className = '',
  id,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const field = useFieldProps(id, rest['aria-describedby']);
  return <input type="date" className={wrapperClass(className)} {...rest} {...field} />;
}

export function Textarea({
  className = '',
  rows = 3,
  id,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const field = useFieldProps(id, rest['aria-describedby']);
  return <textarea rows={rows} className={`${CONTROL} py-2 ${className}`} {...rest} {...field} />;
}

export function Select({
  className = '',
  children,
  id,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const field = useFieldProps(id, rest['aria-describedby']);
  return (
    <select className={wrapperClass(className)} {...rest} {...field}>
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
  id,
  ...rest
}: {
  value: string;
  onValueChange: (v: string) => void;
  className?: string;
  placeholder?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const field = useFieldProps(id, rest['aria-describedby']);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden>
        ₹
      </span>
      <input
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
        {...field}
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
  const ctx = useContext(FieldContext);
  return (
    <div role="radiogroup" aria-labelledby={ctx?.labelId} className="inline-flex flex-wrap rounded-md bg-surface-2 p-1 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-11 rounded px-3 ${value === o.value ? 'bg-surface font-semibold text-ink shadow-e1' : 'text-ink-2'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
