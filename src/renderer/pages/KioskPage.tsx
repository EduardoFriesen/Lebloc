import { useId, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Card';
import {
  ConfirmDialog,
  type ConfirmRequest,
} from '../components/ui/ConfirmDialog';
import { Dialog } from '../components/ui/Dialog';
import { TextField } from '../components/ui/Field';
import { PageBar, usePage } from '../components/ui/Pager';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView } from '../components/ui/States';
import { Stripe } from '../components/ui/Stripe';
import {
  ClearFilter,
  STICKY_HEADING,
  SUMMARY_LIST,
  SUMMARY_TOP,
  SummaryTable,
  SummaryValue,
  WITH_SUMMARY,
} from '../components/ui/SummaryTable';
import {
  FillerRows,
  TABLE_PAGE_SIZE,
  tableClass,
} from '../components/ui/table';
import { call } from '../lib/api';
import { sum } from '../lib/arrays';
import { formatMoney, formatTime, PAYMENT_METHOD_LABELS, todayIso } from '../lib/format';
import { matchesSearch } from '../lib/search';
import { useAsync } from '../lib/useAsync';
import type { KioskSale, Product } from '../../shared/types';
import { ProductForm } from './ProductForm';

const HEADING = 'font-display text-2xl font-semibold';

export function KioskPage() {
  // Picked from the summary: only active (true), only inactive (false) or all (null).
  const [onlyActive, setOnlyActive] = useState<boolean | null>(null);
  const stats = useAsync(() => call('kiosk:stats', {}), []);

  return (
    <section className={WITH_SUMMARY}>
      <div className={SUMMARY_TOP}>
        <PageHeader
          title="Kiosco"
          subtitle="Productos con su precio y los tickets vendidos por día."
        />
        {onlyActive !== null && (
          <ClearFilter
            label={onlyActive ? 'Activos' : 'Inactivos'}
            onClear={() => setOnlyActive(null)}
          />
        )}
      </div>
      {/* The scroll padding keeps focused rows out from under the sticky headings. */}
      <div className={`${SUMMARY_LIST} flex flex-col gap-6 @summary/main:scroll-pt-40`}>
        <ProductsBlock onlyActive={onlyActive} onChanged={stats.reload} />
        <Stripe />
        <SalesBlock onChanged={stats.reload} />
      </div>
      <SummaryTable
        state={stats}
        rows={(data) => [
          {
            label: 'Ventas de hoy',
            value: (
              <SummaryValue
                count={data.todayCount}
                amount={
                  data.todayCount > 0 ? formatMoney(data.todayCents) : undefined
                }
              />
            ),
          },
          {
            label: 'Ganancia de hoy',
            value: <SummaryValue count={formatMoney(data.todayProfitCents)} />,
          },
          {
            label: 'Activos',
            value: <SummaryValue count={data.activeProducts} />,
            onSelect: () => setOnlyActive(true),
            selected: onlyActive === true,
          },
          {
            label: 'Inactivos',
            value: <SummaryValue count={data.inactiveProducts} />,
            onSelect: () => setOnlyActive(false),
            selected: onlyActive === false,
          },
        ]}
      />
    </section>
  );
}

function ProductsTable({
  products,
  empty,
  onEdit,
}: {
  products: Product[];
  empty: string;
  onEdit: (product: Product) => void;
}) {
  const { visible, page, pages, setPage } = usePage(products, TABLE_PAGE_SIZE);
  return (
    <>
      <table className={tableClass}>
        <caption className="sr-only">Productos</caption>
        <thead>
          <tr>
            <th scope="col">Producto</th>
            <th scope="col">Paquete</th>
            <th scope="col">Costo unitario</th>
            <th scope="col">Ganancia</th>
            <th scope="col">Sugerido</th>
            <th scope="col">Precio de venta</th>
            <th scope="col">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((product) => (
            <tr
              key={product.id}
              className={product.active ? '' : 'text-ink-soft'}
            >
              <td className="font-semibold">
                {product.name} {!product.active && <Badge>Inactivo</Badge>}
              </td>
              <td>{product.packSize} u.</td>
              <td>{formatMoney(product.unitCostCents)}</td>
              <td>{product.markupPercent}%</td>
              <td>{formatMoney(product.suggestedPriceCents)}</td>
              <td className="font-semibold">
                {formatMoney(product.priceCents)}
              </td>
              <td className="text-right">
                <Button
                  variant="edit"
                  aria-label={`Editar ${product.name}`}
                  onClick={() => onEdit(product)}
                >
                  Editar
                </Button>
              </td>
            </tr>
          ))}
          <FillerRows filled={visible.length} columns={7} empty={empty} />
        </tbody>
      </table>
      <PageBar
        keep
        label="Productos"
        page={page}
        pages={pages}
        onChange={setPage}
      />
    </>
  );
}

function ProductsBlock({
  onlyActive,
  onChanged,
}: {
  onlyActive: boolean | null;
  onChanged: () => void;
}) {
  const headingId = useId();
  const products = useAsync(
    () => call('products:list', { includeInactive: true }),
    [],
    { keepPreviousData: true },
  );
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div
        className={`${STICKY_HEADING} flex flex-wrap items-end justify-between gap-3`}
      >
        <h2 id={headingId} className={HEADING}>
          Productos
        </h2>
        <div className="flex flex-wrap items-end gap-4">
          <TextField
            label="Buscar producto"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button onClick={() => setEditing('new')}>Nuevo producto</Button>
        </div>
      </div>
      <AsyncView state={products}>
        {(data) => (
          <ProductsTable
            key={`${search}|${String(onlyActive)}`}
            products={data.filter(
              (product) =>
                (onlyActive === null || product.active === onlyActive) &&
                matchesSearch(product.name, search),
            )}
            empty={
              data.length === 0
                ? 'Todavía no hay productos. Creá el primero con “Nuevo producto”.'
                : 'Ningún producto coincide'
            }
            onEdit={setEditing}
          />
        )}
      </AsyncView>
      <Dialog
        open={editing !== null}
        title={editing === 'new' ? 'Nuevo producto' : 'Editar producto'}
        onClose={() => setEditing(null)}
      >
        {editing !== null && (
          <ProductForm
            product={editing === 'new' ? null : editing}
            onSaved={() => {
              setEditing(null);
              products.reload();
              onChanged();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
    </section>
  );
}

function SalesTable({
  sales,
  onVoid,
}: {
  sales: KioskSale[];
  onVoid: (sale: KioskSale) => void;
}) {
  const { visible, page, pages, setPage } = usePage(sales, TABLE_PAGE_SIZE);
  return (
    <>
      <table className={tableClass}>
        <caption className="sr-only">Ventas del día</caption>
        <thead>
          <tr>
            <th scope="col">Hora</th>
            <th scope="col">Detalle</th>
            <th scope="col">Medio</th>
            <th scope="col">Total</th>
            <th scope="col">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((sale) => (
            <tr
              key={sale.id}
              className={sale.voidedAt ? 'text-ink-soft line-through' : ''}
            >
              <td>{formatTime(sale.recordedAt)}</td>
              <td>
                {sale.items
                  .map((item) => `${item.quantity} × ${item.productName}`)
                  .join(', ')}
              </td>
              <td>{PAYMENT_METHOD_LABELS[sale.method]}</td>
              <td className="font-semibold">{formatMoney(sale.totalCents)}</td>
              <td className="text-right">
                {sale.voidedAt ? (
                  <span className="inline-block no-underline">
                    <Badge>Anulado</Badge>
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    aria-label={`Anular ticket de las ${formatTime(sale.recordedAt)}`}
                    onClick={() => onVoid(sale)}
                  >
                    Anular
                  </Button>
                )}
              </td>
            </tr>
          ))}
          <FillerRows
            filled={visible.length}
            columns={5}
            empty="No hay ventas ese día"
          />
        </tbody>
      </table>
      <PageBar
        keep
        label="Ventas"
        page={page}
        pages={pages}
        onChange={setPage}
      />
    </>
  );
}

function SalesBlock({ onChanged }: { onChanged: () => void }) {
  const headingId = useId();
  const [date, setDate] = useState(todayIso());
  const sales = useAsync(
    () => call('kiosk:sales', { date }),
    [date],
    { keepPreviousData: true },
  );
  const [pending, setPending] = useState<ConfirmRequest | null>(null);

  function askVoid(sale: KioskSale) {
    setPending({
      title: 'Anular venta',
      message: `Se anula el ticket de ${formatMoney(sale.totalCents)} de las ${formatTime(sale.recordedAt)}. Deja de contar en el total del día.`,
      confirmLabel: 'Anular venta',
      action: () => call('kiosk:void', { id: sale.id }),
    });
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div
        className={`${STICKY_HEADING} flex flex-wrap items-end justify-between gap-3`}
      >
        <h2 id={headingId} className={HEADING}>
          Ventas
        </h2>
        <TextField
          label="Día"
          type="date"
          value={date}
          onChange={(event) =>
            event.target.value && setDate(event.target.value)
          }
        />
      </div>
      <AsyncView state={sales}>
        {(data) => (
          <>
            <p className="text-sm">
              Total del día:{' '}
              <strong>
                {formatMoney(
                  sum(
                    data
                      .filter((sale) => !sale.voidedAt)
                      .map((sale) => sale.totalCents),
                  ),
                )}
              </strong>
            </p>
            <SalesTable key={date} sales={data} onVoid={askVoid} />
          </>
        )}
      </AsyncView>
      <ConfirmDialog
        request={pending}
        onDone={() => {
          setPending(null);
          sales.reload();
          onChanged();
        }}
        onClose={() => setPending(null)}
      />
    </section>
  );
}
