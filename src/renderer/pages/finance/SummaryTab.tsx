import { useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { marginPercent } from '../../../domain/finance';
import { percentChange } from '../../../domain/periods';
import type { FinanceSeriesPoint, FinanceSummary, PaymentMethod } from '../../../shared/types';
import { AXIS, BAR_GAP, ChartCard, COMPACT_TABLE, GRID, type LegendItem, SERIES, tooltipProps } from '../../components/charts';
import { AsyncView } from '../../components/ui/States';
import { tableClass } from '../../components/ui/table';
import { call } from '../../lib/api';
import { bucketLabel, EXPENSE_CATEGORY_LABELS, formatCompactMoney, formatMoney, PAYMENT_METHOD_LABELS } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { FinanceEmpty, FinanceSkeleton, KpiRow, KpiTile, SECTION_TITLE, SegmentedControl, useFinanceRange } from './shared';

const INCOME: { key: keyof Omit<FinanceSeriesPoint, 'bucket' | 'outflow'>; label: string }[] = [
  { key: 'plans', label: 'Planes' },
  { key: 'kiosk', label: 'Kiosco' },
  { key: 'day_pass', label: 'Pases del día' },
  { key: 'shoe_rental', label: 'Pédulas' },
];
const OUTFLOW_COLOR = 'var(--color-ink)';
const LEGEND: LegendItem[] = [
  ...INCOME.map((series, index) => ({ label: series.label, color: SERIES[index] ?? '' })),
  { label: 'Egresos', color: OUTFLOW_COLOR, line: true },
];
const GRANULARITY_WORDS = { day: 'día', week: 'semana', month: 'mes' } as const;

type MethodFilter = 'total' | PaymentMethod;
const METHODS: readonly MethodFilter[] = ['total', 'cash', 'transfer'];
const METHOD_LABELS: Record<MethodFilter, string> = { total: 'Total', ...PAYMENT_METHOD_LABELS };

export function SummaryTab() {
  const range = useFinanceRange();
  const [method, setMethod] = useState<MethodFilter>('total');
  const summary = useAsync(() => call('finance:summary', method === 'total' ? range : { ...range, method }), [range.from, range.to, method], {
    keepPreviousData: true,
  });
  return (
    <div className="flex flex-col gap-6">
      <div className="self-start">
        <SegmentedControl label="Medio de pago" options={METHODS} labels={METHOD_LABELS} value={method} onChange={setMethod} />
      </div>
      <AsyncView
        state={summary}
        skeleton={<FinanceSkeleton />}
        isEmpty={(data) => data.current.incomeCents === 0 && data.current.expensesCents === 0}
        empty={<FinanceEmpty />}
      >
        {(data) => <SummaryView data={data} byMethod={method !== 'total'} />}
      </AsyncView>
    </div>
  );
}

/** `byMethod`: salaries are the settlements paid that way, and the kiosk stock sold is left out. */
function SummaryView({ data, byMethod }: { data: FinanceSummary; byMethod: boolean }) {
  const { current, before, totals, granularity } = data;
  const margin = marginPercent(current);
  const marginBefore = marginPercent(before);
  const label = (bucket: string) => bucketLabel(bucket, granularity);
  return (
    <div className="flex flex-col gap-6">
      <KpiRow label="Totales del período">
        <KpiTile label="Ingresos" value={formatMoney(current.incomeCents)} change={percentChange(current.incomeCents, before.incomeCents)} />
        <KpiTile
          label="Egresos"
          value={formatMoney(current.expensesCents)}
          change={percentChange(current.expensesCents, before.expensesCents)}
          higherIsBetter={false}
        />
        <KpiTile
          label="Resultado"
          value={<span className={current.resultCents < 0 ? 'text-danger' : ''}>{formatMoney(current.resultCents)}</span>}
          change={percentChange(current.resultCents, before.resultCents)}
        />
        <KpiTile
          label="Margen"
          value={margin === null ? '—' : `${margin} %`}
          change={margin === null || marginBefore === null ? null : margin - marginBefore}
          changeUnit="pts"
          hint="Resultado sobre ingresos"
        />
      </KpiRow>

      <ChartCard
        title="Ingresos y egresos"
        subtitle={`Ingresos del local por fuente y egresos totales, por ${GRANULARITY_WORDS[granularity]}.`}
        legend={LEGEND}
        height="h-80"
        table={<SeriesTable series={data.series} label={label} />}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.series} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="bucket" tickFormatter={label} minTickGap={16} {...AXIS} />
            <YAxis tickFormatter={formatCompactMoney} width={80} {...AXIS} />
            <Tooltip {...tooltipProps(formatMoney, label)} />
            {INCOME.map((series, index) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                name={series.label}
                stackId="income"
                fill={SERIES[index]}
                maxBarSize={48}
                radius={index === INCOME.length - 1 ? [4, 4, 0, 0] : 0}
                {...BAR_GAP}
              />
            ))}
            <Line
              dataKey="outflow"
              name="Egresos"
              type="linear"
              stroke={OUTFLOW_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <section aria-labelledby="estado-de-resultados" className="flex flex-col gap-3">
        <h2 id="estado-de-resultados" className={SECTION_TITLE}>
          Estado de resultados
        </h2>
        <table className={`${tableClass} ${COMPACT_TABLE}`}>
          <caption className="sr-only">Estado de resultados del período</caption>
          <thead>
            <tr>
              <th scope="col">Concepto</th>
              <th scope="col" className="text-right!">
                Importe
              </th>
            </tr>
          </thead>
          <tbody>
            <StatementRow label="Planes (parte del local)" cents={totals.plans} />
            <StatementRow label="Kiosco" cents={totals.kiosk} />
            <StatementRow label="Pases del día" cents={totals.day_pass} />
            <StatementRow label="Pédulas" cents={totals.shoe_rental} />
            <StatementRow label="Total ingresos" cents={current.incomeCents} strong />
            {data.expensesByCategory.map((row) => (
              <StatementRow key={row.category} label={EXPENSE_CATEGORY_LABELS[row.category]} cents={-row.cents} />
            ))}
            <StatementRow label={byMethod ? 'Sueldos liquidados' : 'Sueldos'} cents={-totals.staff} />
            {!byMethod && <StatementRow label="Mercadería vendida del kiosco" cents={-totals.kiosk_cost} />}
            <StatementRow label="Total egresos" cents={-current.expensesCents} strong />
            <StatementRow label="Resultado" cents={current.resultCents} strong />
          </tbody>
        </table>
        <p className="text-sm text-ink-soft">
          Cobrado para profesores: <strong className="text-ink">{formatMoney(totals.teacher)}</strong>. Es de los profesores, no es ingreso del local.
        </p>
        {byMethod && (
          <p className="text-sm text-ink-soft">
            Los sueldos son las liquidaciones pagadas con este medio en el período. La mercadería vendida del kiosco no tiene medio de pago:
            solo cuenta en Total.
          </p>
        )}
      </section>
    </div>
  );
}

function StatementRow({ label, cents, strong = false }: { label: string; cents: number; strong?: boolean }) {
  return (
    <tr className={strong ? 'bg-sunken/40 font-bold' : ''}>
      <td>{label}</td>
      {/* An empty outflow is -0, which would print as "-$ 0,00". */}
      <td className={`text-right tabular-nums ${cents < 0 ? 'text-danger' : ''}`}>{formatMoney(cents || 0)}</td>
    </tr>
  );
}

function SeriesTable({ series, label }: { series: FinanceSeriesPoint[]; label: (bucket: string) => string }) {
  return (
    <table className={`${tableClass} ${COMPACT_TABLE}`}>
      <caption className="sr-only">Ingresos y egresos por período</caption>
      <thead>
        <tr>
          <th scope="col">Período</th>
          {INCOME.map((item) => (
            <th key={item.key} scope="col">
              {item.label}
            </th>
          ))}
          <th scope="col">Egresos</th>
        </tr>
      </thead>
      <tbody>
        {series.map((point) => (
          <tr key={point.bucket}>
            <td className="font-semibold">{label(point.bucket)}</td>
            {INCOME.map((item) => (
              <td key={item.key} className="tabular-nums">
                {formatMoney(point[item.key])}
              </td>
            ))}
            <td className="tabular-nums">{formatMoney(point.outflow)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
