import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Card';
import {
  ConfirmDialog,
  type ConfirmRequest,
} from '../components/ui/ConfirmDialog';
import { Dialog } from '../components/ui/Dialog';
import { CheckboxField, TextField } from '../components/ui/Field';
import { PageBar, usePage } from '../components/ui/Pager';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView } from '../components/ui/States';
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
  return (
    <section className="flex flex-col gap-10 p-8">
      <PageHeader
        title="Kiosco"
        subtitle="Productos con su precio y los tickets vendidos por día."
      />
      <ProductsBlock />
      <SalesBlock />
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

function ProductsBlock() {
  const [showInactive, setShowInactive] = useState(false);
  const products = useAsync(
    () => call('products:list', { includeInactive: showInactive }),
    [showInactive],
    { keepPreviousData: true },
  );
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={HEADING}>Productos</h2>
        <div className="flex flex-wrap items-end gap-4">
          <TextField
            label="Buscar producto"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <CheckboxField
            label="Mostrar inactivos"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
          />
          <Button onClick={() => setEditing('new')}>Nuevo producto</Button>
        </div>
      </div>
      <AsyncView state={products}>
        {(data) => (
          <ProductsTable
            key={`${search}|${showInactive}`}
            products={data.filter((product) =>
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
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
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

function SalesBlock() {
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className={HEADING}>Ventas</h2>
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
        }}
        onClose={() => setPending(null)}
      />
    </div>
  );
}
