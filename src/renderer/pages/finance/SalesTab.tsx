import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { FinanceSales, PlanRanking, ProductRanking } from '../../../shared/types';
import { AXIS, BAR_GAP, ChartCard, COMPACT_TABLE, GRID, SERIES, tooltipProps } from '../../components/charts';
import { PageBar, usePage } from '../../components/ui/Pager';
import { AsyncView, EmptyState } from '../../components/ui/States';
import { TABLE_PAGE_SIZE, tableClass } from '../../components/ui/table';
import { call } from '../../lib/api';
import { formatCompactMoney, formatMoney } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { FinanceEmpty, FinanceSkeleton, KpiRow, KpiTile, SECTION_TITLE, SegmentedControl, useFinanceRange } from './shared';

const PRODUCT_ORDERS = ['units', 'revenueCents', 'profitCents'] as const;
type ProductOrder = (typeof PRODUCT_ORDERS)[number];
const ORDER_LABELS: Record<ProductOrder, string> = { units: 'Unidades', revenueCents: 'Facturación', profitCents: 'Ganancia' };
const TOP_PRODUCTS = 10;
const CATEGORY_AXIS_WIDTH = 160;

export function SalesTab() {
  const range = useFinanceRange();
  const sales = useAsync(() => call('finance:sales', range), [range.from, range.to], { keepPreviousData: true });
  return (
    <AsyncView
      state={sales}
      skeleton={<FinanceSkeleton />}
      isEmpty={(data) => data.plans.length === 0 && data.products.length === 0 && data.walkIns.day_pass.count + data.walkIns.shoe_rental.count === 0}
      empty={<FinanceEmpty />}
    >
      {(data) => <SalesView data={data} />}
    </AsyncView>
  );
}

const units = (count: number) => (count === 1 ? '1 unidad' : `${count} unidades`);
const marginOf = (product: ProductRanking) => (product.revenueCents === 0 ? null : Math.round((product.profitCents * 100) / product.revenueCents));

function SalesView({ data }: { data: FinanceSales }) {
  const [order, setOrder] = useState<ProductOrder>('units');
  const planCount = data.plans.reduce((total, plan) => total + plan.count, 0);
  const planCents = data.plans.reduce((total, plan) => total + plan.localCents, 0);
  const products = [...data.products].sort((a, b) => b[order] - a[order] || a.name.localeCompare(b.name, 'es'));
  const top = products.slice(0, TOP_PRODUCTS);
  const formatValue = order === 'units' ? units : formatMoney;
  return (
    <div className="flex flex-col gap-6">
      <KpiRow label="Ventas del período">
        <KpiTile label="Planes vendidos" value={planCount} hint={`${formatMoney(planCents)} del local`} />
        <KpiTile label="Pases del día" value={data.walkIns.day_pass.count} hint={formatMoney(data.walkIns.day_pass.cents)} />
        <KpiTile label="Pédulas alquiladas" value={data.walkIns.shoe_rental.count} hint={formatMoney(data.walkIns.shoe_rental.cents)} />
        <KpiTile label="Tickets de kiosco" value={data.tickets} hint={`Ticket promedio ${formatMoney(data.averageTicketCents)}`} />
      </KpiRow>

      <div className="grid gap-6 xl:grid-cols-2">
        {data.plans.length === 0 ? (
          <EmptyState title="No se vendieron planes en este período" />
        ) : (
          <ChartCard
            title="Planes más vendidos"
            subtitle="Por fecha de venta. El importe es el precio del local, sin el recargo del profesor."
            height="h-80"
            table={<PlansTable plans={data.plans} />}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={data.plans} margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} vertical horizontal={false} />
                <XAxis type="number" allowDecimals={false} {...AXIS} />
                <YAxis type="category" dataKey="planName" width={CATEGORY_AXIS_WIDTH} {...AXIS} />
                <Tooltip {...tooltipProps((count) => (count === 1 ? '1 vendido' : `${count} vendidos`))} />
                <Bar dataKey="count" name="Vendidos" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={28} {...BAR_GAP} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {top.length === 0 ? (
          <EmptyState title="No se vendieron productos del kiosco en este período" />
        ) : (
          <ChartCard
            title="Productos más vendidos"
            subtitle={`Los ${TOP_PRODUCTS} primeros por ${ORDER_LABELS[order].toLowerCase()}.`}
            height="h-80"
            actions={<SegmentedControl label="Ordenar por" options={PRODUCT_ORDERS} labels={ORDER_LABELS} value={order} onChange={setOrder} />}
            table={<ProductsTable products={top} />}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={top} margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} vertical horizontal={false} />
                <XAxis type="number" allowDecimals={false} tickFormatter={order === 'units' ? String : formatCompactMoney} {...AXIS} />
                <YAxis type="category" dataKey="name" width={CATEGORY_AXIS_WIDTH} {...AXIS} />
                <Tooltip {...tooltipProps(formatValue)} />
                <Bar dataKey={order} name={ORDER_LABELS[order]} fill={SERIES[1]} radius={[0, 4, 4, 0]} maxBarSize={22} {...BAR_GAP} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {products.length > 0 && (
        <section aria-labelledby="detalle-productos" className="flex flex-col gap-3">
          <h2 id="detalle-productos" className={SECTION_TITLE}>
            Detalle por producto
          </h2>
          <PagedProductsTable key={order} products={products} />
        </section>
      )}

      {data.unsold.length > 0 && (
        <section aria-labelledby="sin-ventas" className="flex flex-col gap-3 rounded-2xl bg-surface p-5 shadow-warm">
          <div>
            <h2 id="sin-ventas" className="font-display text-xl font-semibold">
              Sin ventas en el período
            </h2>
            <p className="text-sm text-ink-soft">Productos activos que nadie compró: revisá si conviene seguir teniéndolos.</p>
          </div>
          <ul className="columns-2 gap-6 text-sm md:columns-3 xl:columns-4">
            {data.unsold.map((product) => (
              <li key={product.productId} className="py-0.5">
                {product.name}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PlansTable({ plans }: { plans: PlanRanking[] }) {
  return (
    <table className={`${tableClass} ${COMPACT_TABLE}`}>
      <caption className="sr-only">Planes vendidos</caption>
      <thead>
        <tr>
          <th scope="col">Plan</th>
          <th scope="col">Con profesor</th>
          <th scope="col">Vendidos</th>
          <th scope="col">Importe del local</th>
        </tr>
      </thead>
      <tbody>
        {plans.map((plan) => (
          <tr key={plan.planId}>
            <td className="font-semibold">{plan.planName}</td>
            <td>{plan.withTeacher ? 'Sí' : 'No'}</td>
            <td className="tabular-nums">{plan.count}</td>
            <td className="tabular-nums">{formatMoney(plan.localCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProductsTable({ products }: { products: ProductRanking[] }) {
  return (
    <table className={`${tableClass} ${COMPACT_TABLE}`}>
      <caption className="sr-only">Productos vendidos</caption>
      <thead>
        <tr>
          <th scope="col">Producto</th>
          <th scope="col">Unidades</th>
          <th scope="col">Facturación</th>
          <th scope="col">Costo</th>
          <th scope="col">Ganancia</th>
          <th scope="col">Margen</th>
        </tr>
      </thead>
      <tbody>
        {products.map((product) => {
          const margin = marginOf(product);
          return (
            <tr key={product.productId} className={product.active ? '' : 'text-ink-soft'}>
              <td className="font-semibold">
                {product.name}
                {!product.active && <span className="font-normal"> (inactivo)</span>}
              </td>
              <td className="tabular-nums">{product.units}</td>
              <td className="tabular-nums">{formatMoney(product.revenueCents)}</td>
              <td className="tabular-nums">{formatMoney(product.costCents)}</td>
              <td className="tabular-nums">{formatMoney(product.profitCents)}</td>
              <td className="tabular-nums">{margin === null ? '—' : `${margin} %`}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PagedProductsTable({ products }: { products: ProductRanking[] }) {
  const { visible, page, pages, setPage } = usePage(products, TABLE_PAGE_SIZE);
  return (
    <div className="flex flex-col gap-3">
      <ProductsTable products={visible} />
      <PageBar label="Productos" page={page} pages={pages} onChange={setPage} />
    </div>
  );
}
