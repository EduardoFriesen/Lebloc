import type { ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { DateRange } from '../../../shared/types';
import { EmptyState, SkeletonRows } from '../../components/ui/States';
import { formatPercentChange } from '../../lib/format';

/** The range picked in FinancePage, shared with the tab on screen. */
export function useFinanceRange(): DateRange {
  return useOutletContext<DateRange>();
}

/** Section heading inside a tab. */
export const SECTION_TITLE = 'font-display text-2xl font-semibold';

/** Row of KPI tiles; children are <KpiTile>s. */
export function KpiRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <dl aria-label={label} className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-4">
      {children}
    </dl>
  );
}

interface KpiTileProps {
  label: string;
  value: ReactNode;
  /** Change against the period before; undefined hides the line, null shows "—". */
  change?: number | null;
  /** In points instead of percent (for a margin). */
  changeUnit?: '%' | 'pts';
  /** False for costs: going up is bad news. */
  higherIsBetter?: boolean;
  hint?: ReactNode;
}

/** A headline number. The change carries an arrow and words, never color alone. */
export function KpiTile({ label, value, change, changeUnit = '%', higherIsBetter = true, hint }: KpiTileProps) {
  const moved = change !== undefined && change !== null && change !== 0;
  const good = moved && change > 0 === higherIsBetter;
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-surface p-5 shadow-warm">
      <dt className="text-sm font-semibold text-ink-soft">{label}</dt>
      <dd className="font-display text-3xl leading-tight">{value}</dd>
      {change !== undefined && (
        <dd className="text-sm">
          <span className={`font-bold ${moved ? (good ? 'text-moss' : 'text-danger') : 'text-ink-soft'}`}>
            {moved && <span aria-hidden="true">{change > 0 ? '▲ ' : '▼ '}</span>}
            {formatPercentChange(change, changeUnit)}
          </span>{' '}
          <span className="text-ink-soft">vs. período anterior</span>
        </dd>
      )}
      {hint && <dd className="text-sm text-ink-soft">{hint}</dd>}
    </div>
  );
}

export function FinanceSkeleton() {
  return <SkeletonRows rows={6} />;
}

export function FinanceEmpty() {
  return (
    <EmptyState title="No hay movimientos en este período">
      <p className="text-sm">Probá con otro rango de fechas.</p>
    </EmptyState>
  );
}
