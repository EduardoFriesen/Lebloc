import { useId, useRef, useState } from 'react';
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
import { currentMonthIso, formatDate, formatMoney, formatTime, PAYMENT_METHOD_LABELS, todayIso } from '../lib/format';
import { matchesSearch } from '../lib/search';
import { useAsync } from '../lib/useAsync';
import type { KioskPurchase, KioskSale, Product } from '../../shared/types';
import { KioskSalePanel } from '../components/KioskSalePanel';
import { ProductForm } from './ProductForm';
import { PurchaseForm } from './PurchaseForm';

const HEADING = 'font-display text-2xl font-semibold';

export function KioskPage() {
  // Picked from the summary: only active (true), only inactive (false) or all (null).
  const [onlyActive, setOnlyActive] = useState<boolean | null>(null);
  // Bumped when a ticket or a delivery is saved, so its list reloads.
  const [sales, setSales] = useState(0);
  const [purchases, setPurchases] = useState(0);
  // Bumped when a product is created or edited (also from a delivery), so the checkout shows it.
  const [catalog, setCatalog] = useState(0);
  const bumpCatalog = () => setCatalog((count) => count + 1);
  const stats = useAsync(() => call('kiosk:stats', {}), []);

  return (
    <section className={WITH_SUMMARY}>
      <div className={SUMMARY_TOP}>
        <PageHeader
          title="Kiosco"
          subtitle="Vendé, mirá los tickets del día, los productos y las entregas del proveedor."
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
        <SellBlock
          catalog={catalog}
          onSold={() => {
            stats.reload();
            setSales((count) => count + 1);
          }}
        />
        <Stripe />
        <SalesBlock version={sales} onChanged={stats.reload} />
        <Stripe />
        <ProductsBlock
          onlyActive={onlyActive}
          onChanged={() => {
            stats.reload();
            bumpCatalog();
          }}
          onPurchased={() => {
            setPurchases((count) => count + 1);
            bumpCatalog();
          }}
        />
        <Stripe />
        <PurchasesBlock version={purchases} />
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

/** Checkout: tap products into a ticket and charge it. The search box stays under the sticky heading. */
function SellBlock({ catalog, onSold }: { catalog: number; onSold: () => void }) {
  const headingId = useId();
  const [search, setSearch] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className={`${STICKY_HEADING} flex flex-wrap items-end justify-between gap-3`}>
        <h2 id={headingId} className={HEADING}>
          Vender
        </h2>
        <TextField
          label="Buscar producto"
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            // Typing from further down: bring the matches (right under the sticky heading) into view.
            panel.current?.scrollIntoView({ block: 'nearest' });
          }}
        />
      </div>
      <div ref={panel}>
        <KioskSalePanel search={search} onSearchChange={setSearch} onSold={onSold} catalog={catalog} />
      </div>
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
              <td>
                <span className="font-semibold">{product.name}</span> {!product.active && <Badge>Inactivo</Badge>}
                {product.description && <span className="block text-xs text-ink-soft">{product.description}</span>}
              </td>
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
          <FillerRows filled={visible.length} columns={6} empty={empty} />
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
  onPurchased,
}: {
  onlyActive: boolean | null;
  onChanged: () => void;
  onPurchased: () => void;
}) {
  const headingId = useId();
  const products = useAsync(
    () => call('products:list', { includeInactive: true }),
    [],
    { keepPreviousData: true },
  );
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [purchasing, setPurchasing] = useState(false);

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
            label="Filtrar productos"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button variant="secondary" onClick={() => setPurchasing(true)}>
            Cargar entrega del proveedor
          </Button>
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
      <Dialog open={purchasing} wide title="Entrega del proveedor" onClose={() => setPurchasing(false)}>
        {purchasing && (
          <PurchaseForm
            onSaved={() => {
              setPurchasing(false);
              products.reload();
              onPurchased();
            }}
            onCancel={() => setPurchasing(false)}
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

function SalesBlock({ version, onChanged }: { version: number; onChanged: () => void }) {
  const headingId = useId();
  const [date, setDate] = useState(todayIso());
  const sales = useAsync(
    () => call('kiosk:sales', { date }),
    [date, version],
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

function PurchasesTable({ purchases, onVoid }: { purchases: KioskPurchase[]; onVoid: (purchase: KioskPurchase) => void }) {
  const { visible, page, pages, setPage } = usePage(purchases, TABLE_PAGE_SIZE);
  return (
    <>
      <table className={tableClass}>
        <caption className="sr-only">Entregas del proveedor</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Productos</th>
            <th scope="col">Medio</th>
            <th scope="col">Total</th>
            <th scope="col">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((purchase) => (
            <tr key={purchase.id} className={purchase.voidedAt ? 'text-ink-soft line-through' : ''}>
              <td>{formatDate(purchase.paidAt)}</td>
              <td>{purchase.items.map((item) => `${item.quantity} × ${item.productName}`).join(', ')}</td>
              <td>{PAYMENT_METHOD_LABELS[purchase.method]}</td>
              <td className="font-semibold">{formatMoney(purchase.totalCents)}</td>
              <td className="text-right">
                {purchase.voidedAt ? (
                  <span className="inline-block no-underline">
                    <Badge>Anulada</Badge>
                  </span>
                ) : (
                  <Button variant="ghost" aria-label={`Anular entrega del ${formatDate(purchase.paidAt)}`} onClick={() => onVoid(purchase)}>
                    Anular
                  </Button>
                )}
              </td>
            </tr>
          ))}
          <FillerRows filled={visible.length} columns={5} empty="No hay entregas cargadas este mes." />
        </tbody>
      </table>
      <PageBar keep label="Entregas" page={page} pages={pages} onChange={setPage} />
    </>
  );
}

/** Supplier deliveries of a month. Voiding one leaves the product cost as it is: it is fixed by hand if needed. */
function PurchasesBlock({ version }: { version: number }) {
  const headingId = useId();
  const [month, setMonth] = useState(currentMonthIso());
  const purchases = useAsync(() => call('purchases:list', { month }), [month, version], { keepPreviousData: true });
  const [pending, setPending] = useState<ConfirmRequest | null>(null);

  function askVoid(purchase: KioskPurchase) {
    setPending({
      title: 'Anular entrega',
      message: `Se anula la entrega de ${formatMoney(purchase.totalCents)} del ${formatDate(purchase.paidAt)}. Deja de contar en el balance; el costo de los productos no cambia.`,
      confirmLabel: 'Anular entrega',
      action: () => call('purchases:void', { id: purchase.id }),
    });
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className={`${STICKY_HEADING} flex flex-wrap items-end justify-between gap-3`}>
        <h2 id={headingId} className={HEADING}>
          Entregas del proveedor
        </h2>
        <TextField label="Mes" type="month" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} />
      </div>
      <AsyncView state={purchases}>
        {(data) => (
          <>
            <p className="text-sm">
              Total del mes: <strong>{formatMoney(data.totalCents)}</strong>
            </p>
            <PurchasesTable key={month} purchases={data.purchases} onVoid={askVoid} />
          </>
        )}
      </AsyncView>
      <ConfirmDialog
        request={pending}
        onDone={() => {
          setPending(null);
          purchases.reload();
        }}
        onClose={() => setPending(null)}
      />
    </section>
  );
}
