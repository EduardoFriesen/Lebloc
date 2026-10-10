import { type ReactNode, useState } from 'react';
import { clampPage, pageCount } from '../../lib/paging';

interface PagedListProps<T> {
  items: readonly T[];
  /** Names the list and its page bar for screen readers. */
  label: string;
  pageSize?: number;
  render: (item: T) => ReactNode;
}

/** A page of thin cards with a ‹ 1 / 3 › bar underneath; the bar hides when everything fits. */
export function PagedList<T>({ items, label, pageSize = 4, render }: PagedListProps<T>) {
  const [requested, setPage] = useState(0);
  const page = clampPage(requested, items.length, pageSize);
  const pages = pageCount(items.length, pageSize);
  const visible = items.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="flex flex-col gap-2">
      <ul aria-label={label} className="flex flex-col gap-2">
        {visible.map(render)}
      </ul>
      {pages > 1 && (
        <nav aria-label={`Páginas de ${label.toLowerCase()}`} className="flex items-center justify-center gap-3 text-sm">
          <PageButton label="Página anterior" disabled={page === 0} onClick={() => setPage(page - 1)}>
            ‹
          </PageButton>
          <span aria-live="polite" className="min-w-14 text-center font-semibold text-ink-soft">
            {page + 1} / {pages}
          </span>
          <PageButton label="Página siguiente" disabled={page === pages - 1} onClick={() => setPage(page + 1)}>
            ›
          </PageButton>
        </nav>
      )}
    </div>
  );
}

function PageButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-sunken text-lg font-bold text-ink transition hover:bg-ochre hover:text-night disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-sunken disabled:hover:text-ink"
    >
      {children}
    </button>
  );
}
