import { useState } from 'react';
import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { PERIOD_PRESETS, type PeriodPreset, presetRange, previousRange } from '../../domain/periods';
import { financeRangeInput } from '../../shared/schemas';
import type { DateRange } from '../../shared/types';
import { TextField } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { formatDate, todayIso } from '../lib/format';
import { toFieldErrors } from '../lib/formErrors';
import { SegmentedControl } from './finance/shared';

const PRESET_LABELS: Record<PeriodPreset, string> = {
  this_month: 'Este mes',
  last_month: 'Mes pasado',
  last_3_months: 'Últimos 3 meses',
  last_12_months: 'Últimos 12 meses',
  this_year: 'Este año',
};

const TABS = [
  { to: '/finanzas', label: 'Resumen', end: true },
  { to: '/finanzas/ventas', label: 'Ventas', end: false },
  { to: '/finanzas/afluencia', label: 'Afluencia', end: false },
  { to: '/finanzas/profesores', label: 'Profesores', end: false },
  { to: '/finanzas/clientes', label: 'Clientes', end: false },
];

/** The range in the URL (?desde&hasta), or null when it is missing or invalid. */
function rangeFromParams(params: URLSearchParams): DateRange | null {
  const parsed = financeRangeInput.safeParse({ from: params.get('desde'), to: params.get('hasta') });
  return parsed.success ? parsed.data : null;
}

export function FinancePage() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const range = rangeFromParams(params) ?? presetRange('this_month', today);
  const previous = previousRange(range);
  const preset = PERIOD_PRESETS.find((candidate) => {
    const presetDates = presetRange(candidate, today);
    return presetDates.from === range.from && presetDates.to === range.to;
  });

  function pick(next: DateRange) {
    setParams({ desde: next.from, hasta: next.to }, { replace: true });
  }

  return (
    <section className="flex flex-col gap-6 p-8 pt-6">
      <PageHeader
        title="Finanzas"
        subtitle="Lo cobrado, lo gastado y cómo se mueve el local. El recargo de los profesores no cuenta como ingreso."
      />
      <div className="paper sticky top-0 z-20 -mx-8 -mt-6 flex flex-col gap-4 px-8 pt-3">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <SegmentedControl
            label="Períodos"
            options={PERIOD_PRESETS}
            labels={PRESET_LABELS}
            value={preset}
            onChange={(candidate) => pick(presetRange(candidate, today))}
          />
          <CustomRange range={range} onChange={pick} />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-ink/10">
          <nav aria-label="Secciones de finanzas" className="flex gap-6">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={{ pathname: tab.to, search: location.search }}
                end={tab.end}
                className={({ isActive }) =>
                  `-mb-px border-b-2 px-1 pb-2 font-display text-lg transition-colors ${
                    isActive ? 'border-accent text-ink' : 'border-transparent text-ink-soft hover:text-ink'
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
          <p className="pb-2 text-sm text-ink-soft">
            Comparado con {formatDate(previous.from)} – {formatDate(previous.to)}
          </p>
        </div>
      </div>
      <Outlet context={range} />
    </section>
  );
}

/** "Desde" and "Hasta": the range only changes when both make a valid one; otherwise the error shows inline. */
function CustomRange({ range, onChange }: { range: DateRange; onChange: (range: DateRange) => void }) {
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [shown, setShown] = useState(range);
  // A preset or the URL changed the range: show it in the inputs (adjusting state while rendering, not in an effect).
  if (shown.from !== range.from || shown.to !== range.to) {
    setShown(range);
    setFrom(range.from);
    setTo(range.to);
  }
  const parsed = financeRangeInput.safeParse({ from, to });
  const errors = parsed.success ? {} : toFieldErrors(parsed.error);

  function update(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
    const next = financeRangeInput.safeParse({ from: nextFrom, to: nextTo });
    if (next.success) {
      setShown(next.data);
      onChange(next.data);
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-3">
      <TextField label="Desde" type="date" value={from} onChange={(event) => update(event.target.value, to)} error={errors.from} />
      <TextField label="Hasta" type="date" value={to} onChange={(event) => update(from, event.target.value)} error={errors.to} />
    </div>
  );
}
