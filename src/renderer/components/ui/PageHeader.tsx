import type { ReactNode } from 'react';
import { Stripe } from './Stripe';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4">
        <div>
          <h1 className="font-display text-4xl font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <Stripe />
    </header>
  );
}
