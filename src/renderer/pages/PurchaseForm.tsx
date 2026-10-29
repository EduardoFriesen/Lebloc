import { type FormEvent, useState } from 'react';
import { unitCostCents } from '../../domain/kiosk';
import { parseMoneyInput } from '../../shared/money';
import { purchaseInput } from '../../shared/schemas';
import type { KioskPurchase, PaymentMethod, Product } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { MoneyField, SelectField, TextField } from '../components/ui/Field';
import { Notice } from '../components/ui/Notice';
import { AsyncView, SkeletonRows } from '../components/ui/States';
import { call } from '../lib/api';
import { formatMoney, PAYMENT_METHOD_LABELS, todayIso } from '../lib/format';
import { errorMessage, type FieldErrors, MONEY_ERROR, toFieldErrors } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';
import { ProductForm } from './ProductForm';

interface Line {
  key: number;
  productId: string;
  quantity: string;
  cost: string;
}

let nextKey = 0;
const newLine = (productId = ''): Line => ({
  key: nextKey++,
  productId,
  quantity: '',
  cost: '',
});

/** The new unit cost of a line next to the product's current one, once the line is complete. */
function costPreview(product: Product | undefined, line: Line): string {
  const quantity = Number(line.quantity);
  const cents = parseMoneyInput(line.cost);
  if (!product || !Number.isInteger(quantity) || quantity < 1 || cents === null) return '—';
  const unit = unitCostCents(cents, quantity);
  return `${formatMoney(unit)} c/u (${unit === product.unitCostCents ? 'igual' : `antes ${formatMoney(product.unitCostCents)}`})`;
}

interface PurchaseFormProps {
  onSaved: (purchase: KioskPurchase) => void;
  onCancel: () => void;
}

/** What the supplier brought: per product, the units and what they cost; each sets that product's unit cost. */
export function PurchaseForm({ onSaved, onCancel }: PurchaseFormProps) {
  const products = useAsync(() => call('products:list', { includeInactive: false }), [], { keepPreviousData: true });
  const [paidAt, setPaidAt] = useState(todayIso());
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);
  const [creating, setCreating] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const totalCents = lines.reduce((total, line) => total + (parseMoneyInput(line.cost) ?? 0), 0);

  function updateLine(key: number, change: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)));
  }

  /** A product created here goes in the first line without one, or in a new line. */
  function addProduct(productId: number) {
    setLines((current) => {
      const free = current.find((line) => line.productId === '');
      return free
        ? current.map((line) => (line === free ? { ...line, productId: String(productId) } : line))
        : [...current, newLine(String(productId))];
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const items = lines.map((line) => ({
      productId: line.productId === '' ? -1 : Number(line.productId),
      quantity: Number(line.quantity),
      costCents: parseMoneyInput(line.cost) ?? -1,
    }));
    const parsed = purchaseInput.safeParse({ paidAt, method, items });
    const lineErrors: FieldErrors = {};
    lines.forEach((line, index) => {
      if (line.productId === '') lineErrors[`items.${index}.productId`] = 'Elegí un producto';
      if (parseMoneyInput(line.cost) === null) lineErrors[`items.${index}.costCents`] = MONEY_ERROR;
    });
    if (!parsed.success || Object.keys(lineErrors).length > 0) {
      setErrors({
        ...(parsed.success ? {} : toFieldErrors(parsed.error)),
        ...lineErrors,
      });
      return;
    }
    setErrors({});
    setBusy(true);
    setServerError(null);
    try {
      onSaved(await call('purchases:create', parsed.data));
    } catch (caught) {
      setServerError(errorMessage(caught));
      setBusy(false);
    }
  }

  // The new product dialog sits outside this form: forms can't nest, and its submit would bubble up here.
  return (
    <>
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Fecha de pago"
            type="date"
            max={todayIso()}
            value={paidAt}
            onChange={(event) => setPaidAt(event.target.value)}
            error={errors.paidAt}
          />
          <SelectField label="Medio de pago" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
        </div>
        <AsyncView state={products} skeleton={<SkeletonRows rows={2} />}>
          {(available) => (
            <div className="flex flex-col gap-3">
              {available.length === 0 && <p className="text-sm text-ink-soft">No hay productos activos. Creá uno con “Nuevo producto”.</p>}
              {lines.map((line, index) => (
                <div
                  key={line.key}
                  role="group"
                  aria-label={`Línea ${index + 1}`}
                  className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-3"
                >
                  <SelectField
                    label="Producto"
                    value={line.productId}
                    onChange={(event) => updateLine(line.key, { productId: event.target.value })}
                    error={errors[`items.${index}.productId`]}
                  >
                    <option value="">Elegí un producto</option>
                    {available.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </SelectField>
                  <TextField
                    label="Cantidad"
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                    error={errors[`items.${index}.quantity`]}
                  />
                  <MoneyField
                    label="Costo total"
                    value={line.cost}
                    onChange={(event) => updateLine(line.key, { cost: event.target.value })}
                    error={errors[`items.${index}.costCents`]}
                  />
                  <Button
                    variant="ghost"
                    className="mt-6"
                    aria-label={`Quitar línea ${index + 1}`}
                    disabled={lines.length === 1}
                    onClick={() => setLines((current) => current.filter((other) => other.key !== line.key))}
                  >
                    ✕
                  </Button>
                  <p className="col-span-4 -mt-1 text-sm text-ink-soft" aria-live="polite">
                    Costo unitario:{' '}
                    {costPreview(
                      available.find((product) => String(product.id) === line.productId),
                      line,
                    )}
                  </p>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setLines((current) => [...current, newLine()])}>
                  Agregar producto
                </Button>
                <Button variant="ghost" onClick={() => setCreating(true)}>
                  Nuevo producto
                </Button>
              </div>
            </div>
          )}
        </AsyncView>
        {serverError && <Notice tone="error">{serverError}</Notice>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink/10 pt-4">
          <p>
            Total pagado: <strong>{formatMoney(totalCents)}</strong>
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              Guardar
            </Button>
          </div>
        </div>
      </form>
      <Dialog open={creating} title="Nuevo producto" onClose={() => setCreating(false)}>
        {creating && (
          <ProductForm
            product={null}
            hideCost
            onSaved={(product) => {
              setCreating(false);
              products.reload();
              addProduct(product.id);
            }}
            onCancel={() => setCreating(false)}
          />
        )}
      </Dialog>
    </>
  );
}
