import { type ReactNode, useId } from 'react';
import type { AsyncResult } from '../../lib/useAsync';
import { Button } from './Button';
import { FOCUS_WITHIN, STRETCHED } from './Card';
import { AsyncView, SkeletonRows } from './States';

export interface SummaryRow {
  label: string;
  value: ReactNode;
  /** Applies the list filter that shows these items; the whole row becomes one button. */
  onSelect?: () => void;
  /** The list is showing this row's items. */
  selected?: boolean;
}

/**
 * Page layout, from xl on: header and filters fixed on top, the list below them scrolling on its own, and the
 * summary beside the list, starting at its height. On narrow windows everything stacks and the page scrolls.
 */
export const WITH_SUMMARY =
  'grid gap-8 p-8 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_20rem] xl:grid-rows-[auto_minmax(0,1fr)] xl:gap-y-0';
export const SUMMARY_TOP = 'min-w-0 xl:col-start-1 xl:row-start-1';
// The padding (offset by the negative margin) keeps card shadows, hover lift and focus rings from being clipped.
export const SUMMARY_LIST = 'min-w-0 xl:col-start-1 xl:row-start-2 xl:-m-2 xl:overflow-y-auto xl:p-2';

// Accent bar on the left, drawn inside the row so it doesn't shift the cells.
const SELECTED = 'bg-sunken shadow-[inset_4px_0_0_var(--color-accent)]';

/** Side panel with the headline numbers of a list screen. */
export function SummaryTable<T>({ state, rows }: { state: AsyncResult<T>; rows: (data: T) => SummaryRow[] }) {
  const id = useId();
  return (
    <aside aria-labelledby={id} className="self-start rounded-2xl bg-surface p-5 shadow-warm xl:col-start-2 xl:row-start-2 xl:max-h-full xl:overflow-y-auto">
      <h2 id={id} className="mb-3 font-display text-xl font-semibold">
        Resumen
      </h2>
      <AsyncView state={state} skeleton={<SkeletonRows rows={5} />}>
        {(data) => (
          <table aria-labelledby={id} className="w-full border-collapse text-sm">
            <tbody>
              {rows(data).map(({ label, value, onSelect, selected = false }) => (
                <tr
                  key={label}
                  className={`relative border-b border-ink/10 last:border-b-0 ${onSelect ? `hover:bg-sunken/60 ${FOCUS_WITHIN}` : ''} ${selected ? SELECTED : ''}`}
                >
                  <th scope="row" className={`py-2 pr-2 text-left font-semibold ${selected ? 'pl-3' : ''}`}>
                    {onSelect ? (
                      <button type="button" aria-pressed={selected} className={`cursor-pointer font-semibold ${STRETCHED}`} onClick={onSelect}>
                        {label}
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                  <td className="py-2 text-right">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AsyncView>
    </aside>
  );
}

/** Shown above the list while a summary-only filter is on, to go back to the whole list. */
export function ClearFilter({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <div className="mb-4">
      <Button variant="secondary" onClick={onClear}>
        Quitar filtro: {label}
      </Button>
    </div>
  );
}

/** The big number of a row, with an optional amount before it (e.g. debt: "$ 15.000 · 3"). */
export function SummaryValue({ count, amount }: { count: ReactNode; amount?: string }) {
  return (
    <span>
      {amount && <span className="text-sm text-accent-ink">{amount} · </span>}
      <span className="font-display text-2xl leading-none">{count}</span>
    </span>
  );
}
