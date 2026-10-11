import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ticketTotalCents } from '../../domain/kiosk';
import type { PaymentMethod, Product } from '../../shared/types';
import { call } from '../lib/api';
import { errorMessage } from '../lib/formErrors';
import { formatMoney, PAYMENT_METHOD_LABELS } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Button } from './ui/Button';
import { SelectField } from './ui/Field';
import { Notice, type NoticeState } from './ui/Notice';
import { AsyncView, EmptyState } from './ui/States';

/** productId -> quantity; a line at 0 is removed. */
type Cart = Record<number, number>;

function changeQuantity(cart: Cart, productId: number, delta: number): Cart {
  const { [productId]: current = 0, ...rest } = cart;
  const next = current + delta;
  return next > 0 ? { ...rest, [productId]: next } : rest;
}

/** Counter-side kiosk checkout: tap products into a ticket, pick the method, charge. */
export function KioskSalePanel({ onSold }: { onSold: () => void }) {
  const headingId = useId();
  const products = useAsync(() => call('products:list', { includeInactive: false }), []);
  const [cart, setCart] = useState<Cart>({});
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  async function charge(items: { productId: number; quantity: number }[], total: number) {
    setBusy(true);
    try {
      await call('kiosk:sell', { items, method });
      setCart({});
      setNotice({ tone: 'success', text: `Venta registrada: ${formatMoney(total)}` });
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
          return (
            <div className="flex flex-col gap-4">
              <ul className="flex flex-wrap gap-2" aria-label="Productos">
                {list.map((product: Product) => (
                  <li key={product.id}>
                    <Button variant="secondary" disabled={busy} onClick={() => setCart((current) => changeQuantity(current, product.id, 1))}>
                      {product.name} · {formatMoney(product.priceCents)}
                    </Button>
                  </li>
                ))}
              </ul>
              {lines.length === 0 ? (
                <p className="text-sm text-ink-soft">Tocá un producto para sumarlo al ticket.</p>
              ) : (
                <ul aria-label="Ticket" className="flex flex-col gap-2 rounded-2xl bg-surface p-4 shadow-warm">
                  {lines.map(({ product, quantity }) => (
                    <li key={product.id} className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{product.name}</span>
                      <span className="flex items-center gap-2">
                        <Button variant="ghost" disabled={busy} aria-label={`Quitar uno de ${product.name}`} onClick={() => setCart((c) => changeQuantity(c, product.id, -1))}>
                          −
                        </Button>
                        <span className="min-w-6 text-center tabular-nums">{quantity}</span>
                        <Button variant="ghost" disabled={busy} aria-label={`Agregar uno de ${product.name}`} onClick={() => setCart((c) => changeQuantity(c, product.id, 1))}>
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
                  onClick={() => void charge(lines.map(({ product, quantity }) => ({ productId: product.id, quantity })), total)}
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
