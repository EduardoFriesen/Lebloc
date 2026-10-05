import type { ReactNode } from 'react';
import type { AsyncResult } from '../../lib/useAsync';
import { Button } from './Button';

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-10 animate-pulse rounded-sm bg-chalk-deep" />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 border-l-4 border-danger bg-white p-5">
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
    <div className="flex flex-col items-start gap-2 border-2 border-dashed border-granite/25 p-6">
      <p className="font-display text-xl font-bold uppercase">{title}</p>
      {children}
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
