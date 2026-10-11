import { type ReactNode, useId } from 'react';

/**
 * Shared look of the Recharts charts. Colors are theme tokens (styles.css), so dark mode needs nothing here.
 * Series slots are fixed per entity: never cycled, never picked by rank.
 */
export const SERIES = ['var(--color-series-1)', 'var(--color-series-2)', 'var(--color-series-3)', 'var(--color-series-4)'] as const;

/** Recessive axes: muted ink, no axis or tick lines. */
export const AXIS = { tick: { fill: 'var(--color-ink-soft)', fontSize: 12 }, axisLine: false, tickLine: false } as const;

/** Horizontal guides only, barely visible. */
export const GRID = { vertical: false, stroke: 'var(--color-ink)', strokeOpacity: 0.08 } as const;

/** A 2px surface-colored outline: the gap between stacked segments and neighboring bars. */
export const BAR_GAP = { stroke: 'var(--color-surface)', strokeWidth: 2, isAnimationActive: false } as const;

/** Props for Recharts' <Tooltip>: values and the hovered label go through the given formatters. */
export function tooltipProps(formatValue: (value: number) => string, formatLabel: (label: string) => string = String) {
  return {
    formatter: (value: unknown) => formatValue(Number(value)),
    labelFormatter: (label: unknown) => formatLabel(String(label)),
    contentStyle: {
      background: 'var(--color-surface)',
      border: '1px solid color-mix(in srgb, var(--color-ink) 12%, transparent)',
      borderRadius: 12,
      boxShadow: 'var(--shadow-warm)',
      fontSize: 13,
    },
    labelStyle: { color: 'var(--color-ink)', fontWeight: 700, marginBottom: 4 },
    itemStyle: { color: 'var(--color-ink)', padding: 0 },
    cursor: { fill: 'var(--color-sunken)', fillOpacity: 0.6 },
    isAnimationActive: false,
  };
}

export interface LegendItem {
  label: string;
  color: string;
  /** Drawn as a line instead of a square (e.g. a total over stacked bars). */
  line?: boolean;
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  /** Always present with two or more series; the swatch never goes without its text. */
  legend?: LegendItem[];
  /** Controls next to the title (e.g. a sort toggle). */
  actions?: ReactNode;
  /** The same data as a table, behind "Ver como tabla". */
  table: ReactNode;
  /** Tailwind height class of the plot. */
  height?: string;
  children: ReactNode;
}

/** Dense rows for the data tables of charts and statements (the default table rows fit a button). */
export const COMPACT_TABLE = '[&_td]:h-auto! [&_td]:py-1.5!';

/** A chart in a card: title, legend, the plot and its data as a table. */
export function ChartCard({ title, subtitle, legend, actions, table, height = 'h-72', children }: ChartCardProps) {
  const titleId = useId();
  return (
    <figure aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3 rounded-2xl bg-surface p-5 shadow-warm">
      <figcaption className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={titleId} className="font-display text-xl font-semibold">
            {title}
          </h3>
          {subtitle && <p className="text-sm text-ink-soft">{subtitle}</p>}
        </div>
        {actions}
      </figcaption>
      {legend && (
        <ul aria-label="Referencias" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {legend.map((item) => (
            <li key={item.label} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={item.line ? 'h-0.5 w-4 rounded-full' : 'h-3 w-3 rounded-sm'}
                style={{ background: item.color }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      )}
      <div className={height}>{children}</div>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-ink-soft hover:text-ink">Ver como tabla</summary>
        <div className="mt-3">{table}</div>
      </details>
    </figure>
  );
}
