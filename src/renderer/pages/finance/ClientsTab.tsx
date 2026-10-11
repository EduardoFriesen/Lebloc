import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { FinanceClients } from '../../../shared/types';
import { AXIS, BAR_GAP, ChartCard, COMPACT_TABLE, GRID, type LegendItem, SERIES, tooltipProps } from '../../components/charts';
import { PageBar, usePage } from '../../components/ui/Pager';
import { AsyncView } from '../../components/ui/States';
import { TABLE_PAGE_SIZE, tableClass } from '../../components/ui/table';
import { call } from '../../lib/api';
import { bucketLabel, formatDate, formatMoney } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { FinanceEmpty, FinanceSkeleton, KpiRow, KpiTile, SECTION_TITLE, useFinanceRange } from './shared';

const LEGEND: LegendItem[] = [
  { label: 'Primera compra', color: SERIES[0] },
  { label: 'Renovación', color: SERIES[1] },
];
const LINK = 'underline decoration-ochre underline-offset-4 hover:text-accent-ink';

export function ClientsTab() {
  const range = useFinanceRange();
  const clients = useAsync(() => call('finance:clients', range), [range.from, range.to], { keepPreviousData: true });
  return (
    <AsyncView
      state={clients}
      skeleton={<FinanceSkeleton />}
      isEmpty={(data) => data.newClients + data.visitors + data.firstPurchases + data.renewals + data.lapsed.length === 0}
      empty={<FinanceEmpty />}
    >
      {(data) => <ClientsView data={data} />}
    </AsyncView>
  );
}

function ClientsView({ data }: { data: FinanceClients }) {
  const purchases = data.firstPurchases + data.renewals;
  const label = (bucket: string) => bucketLabel(bucket, data.granularity);
  return (
    <div className="flex flex-col gap-6">
      <KpiRow label="Clientes en el período">
        <KpiTile label="Clientes nuevos" value={data.newClients} hint="Se inscribieron en el período" />
        <KpiTile label="Vinieron" value={data.visitors} hint="Usaron al menos un pase" />
        <KpiTile label="Primeras compras" value={data.firstPurchases} />
        <KpiTile
          label="Renovaciones"
          value={data.renewals}
          hint={purchases === 0 ? undefined : `${Math.round((data.renewals * 100) / purchases)} % de las compras`}
        />
        <KpiTile
          label="Deudores hoy"
          value={data.debtorCount}
          hint={
            <Link to="/clientes?deuda=1" className={LINK}>
              Deben {formatMoney(data.debtTotalCents)}
            </Link>
          }
        />
      </KpiRow>

      <ChartCard
        title="Compras de planes"
        subtitle="Primeras compras y renovaciones de clientes que ya habían comprado."
        legend={LEGEND}
        table={<PurchasesTable series={data.series} label={label} />}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="bucket" tickFormatter={label} minTickGap={16} {...AXIS} />
            <YAxis allowDecimals={false} width={40} {...AXIS} />
            <Tooltip {...tooltipProps(String, label)} />
            <Bar dataKey="first" name="Primera compra" stackId="purchases" fill={SERIES[0]} maxBarSize={48} {...BAR_GAP} />
            <Bar dataKey="renewal" name="Renovación" stackId="purchases" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={48} {...BAR_GAP} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <section aria-labelledby="dejaron-de-venir" className="flex flex-col gap-3">
        <div>
          <h2 id="dejaron-de-venir" className={SECTION_TITLE}>
            Dejaron de venir
          </h2>
          <p className="text-sm text-ink-soft">
            Vinieron entre el {formatDate(data.previous.from)} y el {formatDate(data.previous.to)} y no volvieron en este período. Puede ser un buen
            momento para escribirles.
          </p>
        </div>
        {data.lapsed.length === 0 ? (
          <p className="text-sm">Todos los que vinieron antes volvieron en este período.</p>
        ) : (
          <LapsedTable key={`${data.previous.from}|${data.previous.to}`} lapsed={data.lapsed} />
        )}
      </section>
    </div>
  );
}

function LapsedTable({ lapsed }: { lapsed: FinanceClients['lapsed'] }) {
  const { visible, page, pages, setPage } = usePage(lapsed, TABLE_PAGE_SIZE);
  return (
    <div className="flex flex-col gap-3">
      <table className={`${tableClass} ${COMPACT_TABLE}`}>
        <caption className="sr-only">Clientes que dejaron de venir</caption>
        <thead>
          <tr>
            <th scope="col">Cliente</th>
            <th scope="col">Última visita</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((client) => (
            <tr key={client.clientId}>
              <td className="font-semibold">
                <Link to={`/clientes/${client.clientId}`} className={LINK}>
                  {client.name}
                </Link>
              </td>
              <td className="tabular-nums">{formatDate(client.lastVisit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <PageBar label="Clientes que dejaron de venir" page={page} pages={pages} onChange={setPage} />
    </div>
  );
}

function PurchasesTable({ series, label }: { series: FinanceClients['series']; label: (bucket: string) => string }) {
  return (
    <table className={`${tableClass} ${COMPACT_TABLE}`}>
      <caption className="sr-only">Compras de planes por período</caption>
      <thead>
        <tr>
          <th scope="col">Período</th>
          <th scope="col">Primera compra</th>
          <th scope="col">Renovación</th>
        </tr>
      </thead>
      <tbody>
        {series.map((point) => (
          <tr key={point.bucket}>
            <td className="font-semibold">{label(point.bucket)}</td>
            <td className="tabular-nums">{point.first}</td>
            <td className="tabular-nums">{point.renewal}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
