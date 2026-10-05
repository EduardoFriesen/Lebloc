import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b-2 border-granite pb-4">
      <div>
        <h1 className="font-display text-4xl font-bold uppercase leading-none tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-granite-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
