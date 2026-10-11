import { useId } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { daysBetween } from '../../../domain/dates';
import type { DateRange, FinanceTraffic } from '../../../shared/types';
import { AXIS, BAR_GAP, ChartCard, COMPACT_TABLE, GRID, SERIES, tooltipProps } from '../../components/charts';
import { AsyncView } from '../../components/ui/States';
import { tableClass } from '../../components/ui/table';
import { call } from '../../lib/api';
import { bucketLabel, WEEKDAY_LABELS } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { FinanceEmpty, FinanceSkeleton, KpiRow, KpiTile, useFinanceRange } from './shared';

/** Monday first, the way the week is read at the counter. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const VISITS_COLOR = SERIES[2];
/** Darkest cell, in percent of the series color mixed over the surface. */
const HEAT_MAX = 90;
const HEAT_MIN = 12;
const HEAT_STEPS = [0.2, 0.4, 0.6, 0.8, 1];

const visitsLabel = (count: number) => (count === 1 ? '1 visita' : `${count} visitas`);
const shortDay = (weekday: number) => (WEEKDAY_LABELS[weekday] ?? '').slice(0, 3);
const heat = (share: number) => `color-mix(in oklab, ${VISITS_COLOR} ${Math.round(HEAT_MIN + share * (HEAT_MAX - HEAT_MIN))}%, var(--color-surface))`;

export function TrafficTab() {
  const range = useFinanceRange();
  const traffic = useAsync(() => call('finance:traffic', range), [range.from, range.to], { keepPreviousData: true });
  return (
    <AsyncView state={traffic} skeleton={<FinanceSkeleton />} isEmpty={(data) => data.total === 0} empty={<FinanceEmpty />}>
      {(data) => <TrafficView data={data} range={range} />}
    </AsyncView>
  );
}

function TrafficView({ data, range }: { data: FinanceTraffic; range: DateRange }) {
  const days = daysBetween(range.from, range.to) + 1;
  const weekdays = WEEK_ORDER.map((weekday) => ({ day: shortDay(weekday), name: WEEKDAY_LABELS[weekday] ?? '', visits: data.byWeekday[weekday] ?? 0 }));
  const label = (bucket: string) => bucketLabel(bucket, data.granularity);
  return (
    <div className="flex flex-col gap-6">
      <KpiRow label="Visitas del período">
        <KpiTile label="Visitas" value={data.total} hint="Pases marcados y pases del día" />
        <KpiTile label="Promedio por día" value={(data.total / days).toLocaleString('es-AR', { maximumFractionDigits: 1 })} />
        <KpiTile label="Pases libres" value={data.byKind.free} />
        <KpiTile label="Clases con profesor" value={data.byKind.teacher} />
        <KpiTile label="Pases del día" value={data.byKind.day_pass} />
      </KpiRow>

      <Heatmap heatmap={data.heatmap} />

      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Por día de la semana" subtitle="Visitas de cada día en todo el período." table={<WeekdayTable rows={weekdays} />}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekdays} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="day" {...AXIS} />
              <YAxis allowDecimals={false} width={40} {...AXIS} />
              <Tooltip {...tooltipProps(visitsLabel)} />
              <Bar dataKey="visits" name="Visitas" fill={VISITS_COLOR} radius={[4, 4, 0, 0]} maxBarSize={48} {...BAR_GAP} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Visitas en el tiempo" subtitle="Cuántas visitas hubo en cada período." table={<SeriesTable series={data.series} label={label} />}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.series} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="bucket" tickFormatter={label} minTickGap={16} {...AXIS} />
              <YAxis allowDecimals={false} width={40} {...AXIS} />
              <Tooltip {...tooltipProps(visitsLabel, label)} />
              <Line dataKey="visits" name="Visitas" type="linear" stroke={VISITS_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

/** Weekday × hour as a real table: each cell tinted by its share of the busiest slot, the number inside it. */
function Heatmap({ heatmap }: { heatmap: number[][] }) {
  const titleId = useId();
  const max = Math.max(0, ...heatmap.flat());
  const busyHours = Array.from({ length: 24 }, (_, hour) => hour).filter((hour) => heatmap.some((day) => (day[hour] ?? 0) > 0));
  const first = busyHours[0] ?? 0;
  const hours = Array.from({ length: (busyHours.at(-1) ?? first) - first + 1 }, (_, index) => first + index);
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-warm">
      <div>
        <h2 id={titleId} className="font-display text-xl font-semibold">
          Cuándo viene la gente
        </h2>
        <p className="text-sm text-ink-soft">Visitas por día de la semana y hora de llegada. Cuanto más intenso el color, más gente.</p>
      </div>
      <div className="overflow-x-auto">
        <table aria-labelledby={titleId} className="w-full border-separate border-spacing-0.5 text-xs">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Día</span>
              </th>
              {hours.map((hour) => (
                <th key={hour} scope="col" className="pb-1 font-semibold text-ink-soft">
                  {hour} h
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEK_ORDER.map((weekday) => (
              <tr key={weekday}>
                <th scope="row" className="pr-2 text-left text-sm font-semibold">
                  {shortDay(weekday)}
                </th>
                {hours.map((hour) => {
                  const count = heatmap[weekday]?.[hour] ?? 0;
                  const share = max === 0 ? 0 : count / max;
                  return (
                    <td
                      key={hour}
                      title={`${WEEKDAY_LABELS[weekday] ?? ''} ${hour} h: ${visitsLabel(count)}`}
                      className={`h-9 min-w-9 rounded-md text-center font-semibold tabular-nums ${share > 0.55 ? 'text-heat-ink' : 'text-ink'}`}
                      style={{ background: count === 0 ? 'var(--color-sunken)' : heat(share) }}
                    >
                      {count === 0 ? <span className="sr-only">0</span> : count}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div aria-hidden="true" className="flex items-center gap-2 self-end text-xs text-ink-soft">
        Menos
        {HEAT_STEPS.map((step) => (
          <span key={step} className="h-3 w-6 rounded-sm" style={{ background: heat(step) }} />
        ))}
        Más
      </div>
    </section>
  );
}

function WeekdayTable({ rows }: { rows: { name: string; visits: number }[] }) {
  return (
    <table className={`${tableClass} ${COMPACT_TABLE}`}>
      <caption className="sr-only">Visitas por día de la semana</caption>
      <thead>
        <tr>
          <th scope="col">Día</th>
          <th scope="col">Visitas</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td className="font-semibold">{row.name}</td>
            <td className="tabular-nums">{row.visits}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SeriesTable({ series, label }: { series: FinanceTraffic['series']; label: (bucket: string) => string }) {
  return (
    <table className={`${tableClass} ${COMPACT_TABLE}`}>
      <caption className="sr-only">Visitas por período</caption>
      <thead>
        <tr>
          <th scope="col">Período</th>
          <th scope="col">Visitas</th>
        </tr>
      </thead>
      <tbody>
        {series.map((point) => (
          <tr key={point.bucket}>
            <td className="font-semibold">{label(point.bucket)}</td>
            <td className="tabular-nums">{point.visits}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
