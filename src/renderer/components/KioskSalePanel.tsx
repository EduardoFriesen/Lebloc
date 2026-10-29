import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ticketTotalCents } from '../../domain/kiosk';
import type { PaymentMethod, Product } from '../../shared/types';
import { call } from '../lib/api';
import { errorMessage } from '../lib/formErrors';
import { formatMoney, PAYMENT_METHOD_LABELS } from '../lib/format';
import { matchesSearch } from '../lib/search';
import { useAsync } from '../lib/useAsync';
import { Button } from './ui/Button';
import { SelectField } from './ui/Field';
import { Notice, type NoticeState } from './ui/Notice';
import { AsyncView, EmptyState, SkeletonRows } from './ui/States';

/** productId -> quantity; a line at 0 is removed. */
type Cart = Record<number, number>;

function changeQuantity(cart: Cart, productId: number, delta: number): Cart {
  const { [productId]: current = 0, ...rest } = cart;
  const next = current + delta;
  return next > 0 ? { ...rest, [productId]: next } : rest;
}

interface KioskSalePanelProps {
  /** Product search, rendered by the caller (it sits in the sticky kiosk header). */
  search: string;
  onSearchChange: (search: string) => void;
  onSold: () => void;
  /** Changes when a product is created or edited, so the buttons show it. */
  catalog: number;
}

/** Kiosk checkout: tap products into a ticket, pick the method, charge. Heading and search box are the caller's. */
export function KioskSalePanel({ search, onSearchChange, onSold, catalog }: KioskSalePanelProps) {
  const products = useAsync(() => call('products:list', { includeInactive: false }), [catalog], { keepPreviousData: true });
  const top = useAsync(() => call('kiosk:top', {}), [catalog], { keepPreviousData: true });
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
      onSearchChange('');
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
    <div className="flex flex-col gap-3">
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
          const found = list.filter((product) => matchesSearch(product.name, search));
          return (
            <div className="flex flex-col gap-4">
              {search.trim() ? (
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
    </div>
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
