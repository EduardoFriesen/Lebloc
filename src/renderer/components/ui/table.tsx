import type { MouseEvent } from 'react';

/** Rows of every table, so pages fill the same height, blank rows included (3.25rem fits a row with a button). */
export const tableClass =
  'w-full border-separate border-spacing-0 overflow-hidden rounded-2xl bg-surface text-sm shadow-warm [&_td]:h-13 [&_td]:border-b [&_td]:border-ink/10 [&_tr:last-child_td]:border-b-0 [&_td]:px-3 [&_td]:py-2 [&_th]:border-b-2 [&_th]:border-ochre/60 [&_th]:bg-sunken/50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:text-ink-soft';

/** A row ticked by hand (invoiced, paid): it stays green. */
export const MARKED_ROW = 'bg-[color-mix(in_srgb,var(--color-moss)_38%,var(--color-surface))]';

/** The box that ticks a row; it keeps the mark reachable by keyboard. */
export const ROW_BOX = 'size-4 shrink-0 cursor-pointer accent-moss';

/** A click anywhere on the row ticks its box, except on the row's own links, buttons and the box itself. */
export function clickRowBox(event: MouseEvent<HTMLTableRowElement>): void {
  if ((event.target as HTMLElement).closest('a, button, input, label')) return;
  event.currentTarget.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
}

/** Rows per page of every table. */
export const TABLE_PAGE_SIZE = 10;

interface FillerRowsProps {
  /** Rows already shown on this page. */
  filled: number;
  columns: number;
  /** Shown in the first row when the page has nothing. */
  empty: string;
  size?: number;
}

/** Blank rows up to the page size, so a table keeps its height and nothing below it jumps. */
export function FillerRows({ filled, columns, empty, size = TABLE_PAGE_SIZE }: FillerRowsProps) {
  return Array.from({ length: Math.max(0, size - filled) }, (_, index) =>
    index === 0 && filled === 0 ? (
      <tr key={index}>
        <td colSpan={columns} className="text-ink-soft">
          {empty}
        </td>
      </tr>
    ) : (
      <tr key={index} aria-hidden="true">
        <td colSpan={columns} />
      </tr>
    ),
  );
}
