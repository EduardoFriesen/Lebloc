import { type FormEvent, useState } from 'react';
import { allocatePayment } from '../../domain/allocation';
import { parseMoneyInput } from '../../shared/money';
import { paymentInput } from '../../shared/schemas';
import type { Payment, PaymentMethod, Sale } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { MoneyField, SelectField, TextField } from '../components/ui/Field';
import { Notice } from '../components/ui/Notice';
import { call } from '../lib/api';
import { sum } from '../lib/arrays';
import { formatMoney, formatMoneyInput, todayIso } from '../lib/format';
import { errorMessage, type FieldErrors, MONEY_ERROR, toFieldErrors } from '../lib/formErrors';

interface PaymentFormProps {
  sale: Sale;
  payments: Payment[];
  onDone: () => void;
  onCancel: () => void;
}

export function PaymentForm({ sale, payments, onDone, onCancel }: PaymentFormProps) {
  const [amount, setAmount] = useState(formatMoneyInput(sale.debtCents));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amountCents = parseMoneyInput(amount);
  const split = splitPreview();

  function splitPreview(): string | null {
    if (amountCents === null || sale.teacherSurchargeCents === 0) return null;
    const active = payments.filter((payment) => !payment.voidedAt);
    try {
      const allocation = allocatePayment({
        totalCents: sale.totalCents,
        surchargeCents: sale.teacherSurchargeCents,
        splitRule: sale.splitRule,
        allocatedLocalCents: sum(active.map((payment) => payment.localCents)),
        allocatedTeacherCents: sum(active.map((payment) => payment.teacherCents)),
        amountCents,
      });
      return `Para el local ${formatMoney(allocation.localCents)} · para ${sale.teacherName ?? 'el profesor'} ${formatMoney(allocation.teacherCents)}`;
    } catch (caught) {
      return errorMessage(caught);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = paymentInput.safeParse({ saleId: sale.id, amountCents: amountCents ?? -1, method, paidAt });
    if (!parsed.success || amountCents === null) {
      setErrors({
        ...(parsed.success ? {} : toFieldErrors(parsed.error)),
        ...(amountCents === null ? { amountCents: MONEY_ERROR } : {}),
      });
      return;
    }
    setErrors({});
    setBusy(true);
    setServerError(null);
    try {
      await call('payments:create', parsed.data);
      onDone();
    } catch (caught) {
      setServerError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <p className="text-sm">
        {sale.planName} · Deuda actual: <strong>{formatMoney(sale.debtCents)}</strong>
      </p>
      <MoneyField label="Monto" value={amount} onChange={(event) => setAmount(event.target.value)} error={errors.amountCents} />
      <SelectField label="Medio de pago" value={method} onChange={(event) => setMethod(event.target.value === 'transfer' ? 'transfer' : 'cash')}>
        <option value="cash">Efectivo</option>
        <option value="transfer">Transferencia</option>
      </SelectField>
      <TextField label="Fecha" type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} error={errors.paidAt} />
      {split && <p className="text-sm text-ink-soft">{split}</p>}
      {serverError && <Notice tone="error">{serverError}</Notice>}
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
