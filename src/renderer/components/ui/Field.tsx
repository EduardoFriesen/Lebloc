import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useId } from 'react';

const CONTROL =
  'w-full rounded-xl border border-ink/25 bg-surface px-3 py-2 text-sm text-ink aria-[invalid=true]:border-danger';

function describedBy(id: string, error?: string, hint?: string): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

function FieldShell({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold text-ink-soft">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-ink-soft">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & { label: string; error?: string; hint?: string };

export function TextField({ label, error, hint, className = '', ...props }: TextFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${CONTROL} ${className}`}
        {...props}
      />
    </FieldShell>
  );
}

export function MoneyField(props: TextFieldProps) {
  return <TextField inputMode="decimal" autoComplete="off" placeholder="0,00" {...props} />;
}

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & { label: string; error?: string; children: ReactNode };

export function SelectField({ label, error, children, ...props }: SelectFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error}>
      <select id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error)} className={CONTROL} {...props}>
        {children}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({ label, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & { label: string }) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <input id={id} type="checkbox" className="h-4 w-4 accent-accent" {...props} />
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
    </div>
  );
}
