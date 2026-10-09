import type { ReactNode } from 'react';
import type { AsyncResult } from '../../lib/useAsync';
import { Button } from './Button';

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-10 animate-pulse rounded-xl bg-chalk-deep" />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border-l-4 border-danger bg-paper p-5 shadow-warm">
      <p className="font-semibold">No pudimos cargar esta sección.</p>
      <p className="text-sm text-granite-soft">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border-2 border-dashed border-ochre/50 p-6">
      <svg aria-hidden="true" viewBox="0 0 48 32" className="w-12 shrink-0">
        <circle cx="30" cy="12" r="7" className="fill-ochre" />
        <path d="M0 32 L16 10 L26 22 L32 16 L48 32 Z" className="fill-volt/80" />
      </svg>
      <div className="flex flex-col items-start gap-2">
        <p className="font-display text-xl font-semibold">{title}</p>
        {children}
      </div>
    </div>
  );
}

interface AsyncViewProps<T> {
  state: AsyncResult<T>;
  children: (data: T) => ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  skeleton?: ReactNode;
}

export function AsyncView<T>({ state, children, isEmpty, empty, skeleton }: AsyncViewProps<T>) {
  if (state.status === 'loading') return <>{skeleton ?? <SkeletonRows />}</>;
  if (state.status === 'error') return <ErrorState message={state.error.message} onRetry={state.reload} />;
  if (empty && isEmpty?.(state.data)) return <>{empty}</>;
  return <>{children(state.data)}</>;
}
