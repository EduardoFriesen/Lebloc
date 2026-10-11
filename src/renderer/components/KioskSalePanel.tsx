import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ticketTotalCents } from '../../domain/kiosk';
import type { PaymentMethod, Product } from '../../shared/types';
import { call } from '../lib/api';
import { errorMessage } from '../lib/formErrors';
import { formatMoney, PAYMENT_METHOD_LABELS } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Button } from './ui/Button';
import { SelectField, TextField } from './ui/Field';
import { Notice, type NoticeState } from './ui/Notice';
import { AsyncView, EmptyState, SkeletonRows } from './ui/States';

/** productId -> quantity; a line at 0 is removed. */
type Cart = Record<number, number>;

function changeQuantity(cart: Cart, productId: number, delta: number): Cart {
  const { [productId]: current = 0, ...rest } = cart;
  const next = current + delta;
  return next > 0 ? { ...rest, [productId]: next } : rest;
}

const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();

/** Counter-side kiosk checkout: tap products into a ticket, pick the method, charge. */
export function KioskSalePanel({ onSold }: { onSold: () => void }) {
  const headingId = useId();
  const products = useAsync(() => call('products:list', { includeInactive: false }), []);
  const top = useAsync(() => call('kiosk:top', {}), []);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Cart>({});
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  function updateCart(productId: number, delta: number) {
    setNotice(null);
    setCart((current) => changeQuantity(current, productId, delta));
  }

  async function charge(items: { productId: number; quantity: number }[]) {
    setBusy(true);
    try {
      const sale = await call('kiosk:sell', { items, method });
      setCart({});
      setSearch('');
      setNotice({ tone: 'success', text: `Venta registrada: ${formatMoney(sale.totalCents)}` });
      top.reload();
      onSold();
    } catch (caught) {
      setNotice({ tone: 'error', text: errorMessage(caught) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="font-display text-2xl font-semibold">
        Kiosco
      </h2>
      <AsyncView
        state={products}
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState title="Todavía no hay productos">
            <Link className="underline" to="/kiosco">
              Cargar productos
            </Link>
          </EmptyState>
        }
      >
        {(list) => {
          const lines = list.filter((product) => cart[product.id]).map((product) => ({ product, quantity: cart[product.id] ?? 0 }));
          const total = ticketTotalCents(lines.map(({ product, quantity }) => ({ quantity, unitPriceCents: product.priceCents })));
          const query = normalize(search.trim());
          const found = list.filter((product) => normalize(product.name).includes(query));
          return (
            <div className="flex flex-col gap-4">
              <TextField label="Buscar producto" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
              {query ? (
                found.length === 0 ? (
                  <p className="text-sm text-ink-soft">Ningún producto coincide</p>
                ) : (
                  <ProductButtons products={found} busy={busy} onAdd={(id) => updateCart(id, 1)} />
                )
              ) : (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-bold text-ink-soft">Más vendidos</h3>
                  <AsyncView state={top} skeleton={<SkeletonRows rows={1} />}>
                    {(best) => <ProductButtons products={best} busy={busy} onAdd={(id) => updateCart(id, 1)} />}
                  </AsyncView>
                </div>
              )}
              {lines.length === 0 ? (
                <p className="text-sm text-ink-soft">Tocá un producto para sumarlo al ticket.</p>
              ) : (
                <ul aria-label="Ticket" className="flex flex-col gap-2 rounded-2xl bg-surface p-4 shadow-warm">
                  {lines.map(({ product, quantity }) => (
                    <li key={product.id} className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{product.name}</span>
                      <span className="flex items-center gap-2">
                        <Button variant="ghost" disabled={busy} aria-label={`Quitar uno de ${product.name}`} onClick={() => updateCart(product.id, -1)}>
                          −
                        </Button>
                        <span className="min-w-6 text-center tabular-nums">{quantity}</span>
                        <Button variant="ghost" disabled={busy} aria-label={`Agregar uno de ${product.name}`} onClick={() => updateCart(product.id, 1)}>
                          +
                        </Button>
                        <span className="min-w-20 text-right tabular-nums">{formatMoney(quantity * product.priceCents)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <SelectField label="Medio de pago" value={method} onChange={(event) => setMethod(event.target.value === 'transfer' ? 'transfer' : 'cash')}>
                  {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((key) => (
                    <option key={key} value={key}>
                      {PAYMENT_METHOD_LABELS[key]}
                    </option>
                  ))}
                </SelectField>
                <Button
                  disabled={busy || lines.length === 0}
                  onClick={() => void charge(lines.map(({ product, quantity }) => ({ productId: product.id, quantity })))}
                >
                  Cobrar {formatMoney(total)}
                </Button>
              </div>
            </div>
          );
        }}
      </AsyncView>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    </section>
  );
}

function ProductButtons({ products, busy, onAdd }: { products: Product[]; busy: boolean; onAdd: (productId: number) => void }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Productos">
      {products.map((product) => (
        <li key={product.id}>
          <Button variant="secondary" disabled={busy} onClick={() => onAdd(product.id)}>
            {product.name} · {formatMoney(product.priceCents)}
          </Button>
        </li>
      ))}
    </ul>
  );
}
