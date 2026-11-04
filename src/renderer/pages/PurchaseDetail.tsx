import { type FormEvent, useState } from 'react';
import { parseMoneyInput } from '../../shared/money';
import type { KioskPurchase, KioskPurchasePayment, PaymentMethod } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { ConfirmDialog, type ConfirmRequest } from '../components/ui/ConfirmDialog';
import { Dialog } from '../components/ui/Dialog';
import { MoneyField, SelectField, TextField } from '../components/ui/Field';
import { Notice } from '../components/ui/Notice';
import { AsyncView, SkeletonRows } from '../components/ui/States';
import { tableClass } from '../components/ui/table';
import { call } from '../lib/api';
import { formatDate, formatDateTime, formatMoney, formatMoneyInput, PAYMENT_METHOD_LABELS, todayIso } from '../lib/format';
import { errorMessage, MONEY_ERROR } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';
import { PurchaseForm } from './PurchaseForm';

interface PurchaseDetailDialogProps {
  /** The delivery shown; null keeps the dialog closed. */
  purchaseId: number | null;
  /** Something changed (a payment, an edit, a void): the lists behind reload. */
  onChanged: () => void;
  onClose: () => void;
}

/** What came in, what it cost and how it was paid; payments, edits and voids are done from here. */
export function PurchaseDetailDialog({ purchaseId, onChanged, onClose }: PurchaseDetailDialogProps) {
  return (
    <Dialog wide open={purchaseId !== null} title="Detalle de la entrega" onClose={onClose}>
      {purchaseId !== null && <PurchaseDetail purchaseId={purchaseId} onChanged={onChanged} />}
      {/* Outside the detail, so it is there while it loads or if it fails too. */}
      <div className="flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Dialog>
  );
}

function PurchaseDetail({ purchaseId, onChanged }: { purchaseId: number; onChanged: () => void }) {
  const purchase = useAsync(() => call('purchases:get', { id: purchaseId }), [purchaseId]);
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<ConfirmRequest | null>(null);

  function changed() {
    purchase.reload();
    onChanged();
  }

  return (
    <AsyncView state={purchase} skeleton={<SkeletonRows rows={5} />}>
      {(data) => {
        const voided = data.voidedAt !== null;
        const activePayments = data.payments.filter((payment) => !payment.voidedAt).length;
        return (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-soft">
              Llegó el {formatDate(data.receivedAt)} · cargada el {formatDateTime(data.recordedAt)}
              {voided && ' · Anulada'}
            </p>
            <ItemsTable purchase={data} />
            <PaymentsTable
              payments={data.payments}
              canVoid={!voided}
              onVoid={(payment) =>
                setPending({
                  title: 'Anular pago',
                  message: `Se anula el pago de ${formatMoney(payment.amountCents)} del ${formatDate(payment.paidAt)} y la deuda con el proveedor vuelve a subir.`,
                  confirmLabel: 'Anular pago',
                  action: () => call('purchases:voidPayment', { id: payment.id }),
                })
              }
            />
            {!voided &&
              (data.debtCents > 0 ? (
                <p className="font-semibold text-accent-ink">Debe {formatMoney(data.debtCents)}</p>
              ) : (
                <p className="font-semibold text-moss">Pagada</p>
              ))}
            {paying && (
              <PaymentForm
                purchase={data}
                onDone={() => {
                  setPaying(false);
                  changed();
                }}
                onCancel={() => setPaying(false)}
              />
            )}
            {!voided && !paying && (
              <div className="flex flex-wrap gap-2">
                {data.debtCents > 0 && <Button onClick={() => setPaying(true)}>Registrar pago</Button>}
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  Modificar
                </Button>
                {activePayments === 0 && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setPending({
                        title: 'Anular entrega',
                        message: `Se anula la entrega de ${formatMoney(data.totalCents)} del ${formatDate(data.receivedAt)}. El costo de los productos no cambia.`,
                        confirmLabel: 'Anular entrega',
                        action: () => call('purchases:void', { id: data.id }),
                      })
                    }
                  >
                    Anular entrega
                  </Button>
                )}
              </div>
            )}
            <Dialog wide open={editing} title="Modificar entrega" onClose={() => setEditing(false)}>
              {editing && (
                <PurchaseForm
                  purchase={data}
                  onSaved={() => {
                    setEditing(false);
                    changed();
                  }}
                  onCancel={() => setEditing(false)}
                  onProductCreated={onChanged}
                />
              )}
            </Dialog>
            <ConfirmDialog
              request={pending}
              onClose={() => setPending(null)}
              onDone={() => {
                setPending(null);
                changed();
              }}
            />
          </div>
        );
      }}
    </AsyncView>
  );
}

function ItemsTable({ purchase }: { purchase: KioskPurchase }) {
  return (
    <table className={tableClass}>
      <caption className="sr-only">Productos de la entrega</caption>
      <thead>
        <tr>
          <th scope="col">Producto</th>
          <th scope="col">Cantidad</th>
          <th scope="col">Costo</th>
          <th scope="col">Costo unitario</th>
        </tr>
      </thead>
      <tbody>
        {purchase.items.map((item) => (
          <tr key={item.productId}>
            <td className="font-semibold">{item.productName}</td>
            <td className="tabular-nums">{item.quantity}</td>
            <td className="tabular-nums">{formatMoney(item.costCents)}</td>
            <td className="tabular-nums">{formatMoney(item.unitCostCents)}</td>
          </tr>
        ))}
        <tr>
          <td colSpan={2} className="font-semibold">
            Total
          </td>
          <td colSpan={2} className="font-semibold tabular-nums">
            {formatMoney(purchase.totalCents)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function PaymentsTable({ payments, canVoid, onVoid }: { payments: KioskPurchasePayment[]; canVoid: boolean; onVoid: (payment: KioskPurchasePayment) => void }) {
  return (
    <table className={tableClass}>
      <caption className="sr-only">Pagos de la entrega</caption>
      <thead>
        <tr>
          <th scope="col">Fecha</th>
          <th scope="col">Medio</th>
          <th scope="col">Monto</th>
          <th scope="col">Estado</th>
        </tr>
      </thead>
      <tbody>
        {payments.length === 0 && (
          <tr>
            <td colSpan={4} className="text-ink-soft">
              Sin pagos.
            </td>
          </tr>
        )}
        {payments.map((payment) => (
          <tr key={payment.id} className={payment.voidedAt ? 'text-ink-soft' : ''}>
            <td className="tabular-nums">{formatDate(payment.paidAt)}</td>
            <td>{PAYMENT_METHOD_LABELS[payment.method]}</td>
            <td className="tabular-nums">{formatMoney(payment.amountCents)}</td>
            <td>
              {payment.voidedAt ? (
                'Anulado'
              ) : canVoid ? (
                <Button
                  variant="ghost"
                  className="px-3!"
                  aria-label={`Anular pago de ${formatMoney(payment.amountCents)} del ${formatDate(payment.paidAt)}`}
                  onClick={() => onVoid(payment)}
                >
                  Anular
                </Button>
              ) : (
                'Activo'
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A payment to the supplier for this delivery; it suggests what is still owed. */
function PaymentForm({ purchase, onDone, onCancel }: { purchase: KioskPurchase; onDone: () => void; onCancel: () => void }) {
  const [amount, setAmount] = useState(formatMoneyInput(purchase.debtCents));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amountCents = parseMoneyInput(amount);
    if (amountCents === null) {
      setError(MONEY_ERROR);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await call('purchases:pay', { purchaseId: purchase.id, amountCents, method, paidAt });
      onDone();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-3 rounded-2xl bg-sunken/50 p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <MoneyField label="Monto" value={amount} onChange={(event) => setAmount(event.target.value)} />
        <SelectField label="Medio de pago" value={method} onChange={(event) => setMethod(event.target.value === 'transfer' ? 'transfer' : 'cash')}>
          <option value="cash">{PAYMENT_METHOD_LABELS.cash}</option>
          <option value="transfer">{PAYMENT_METHOD_LABELS.transfer}</option>
        </SelectField>
        <TextField label="Fecha" type="date" max={todayIso()} value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          Confirmar pago
        </Button>
      </div>
    </form>
  );
}
