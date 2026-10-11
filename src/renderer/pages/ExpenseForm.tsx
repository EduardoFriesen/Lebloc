import { type FormEvent, useState } from 'react';
import { parseMoneyInput } from '../../shared/money';
import { expenseInput } from '../../shared/schemas';
import type { Expense, ExpenseCategory, PaymentMethod } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { MoneyField, SelectField, TextField } from '../components/ui/Field';
import { Notice } from '../components/ui/Notice';
import { call } from '../lib/api';
import { EXPENSE_CATEGORY_LABELS, formatMoneyInput, PAYMENT_METHOD_LABELS, todayIso } from '../lib/format';
import { errorMessage, type FieldErrors, MONEY_ERROR, toFieldErrors } from '../lib/formErrors';

interface ExpenseFormProps {
  /** An earlier expense to repeat: same data, dated today. */
  repeat: Expense | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function ExpenseForm({ repeat, onSaved, onCancel }: ExpenseFormProps) {
  const [category, setCategory] = useState<ExpenseCategory>(repeat?.category ?? 'rent');
  const [description, setDescription] = useState(repeat?.description ?? '');
  const [amount, setAmount] = useState(repeat ? formatMoneyInput(repeat.amountCents) : '');
  const [method, setMethod] = useState<PaymentMethod>(repeat?.method ?? 'cash');
  const [paidAt, setPaidAt] = useState(todayIso());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amountCents = parseMoneyInput(amount);
    const parsed = expenseInput.safeParse({ category, description, amountCents: amountCents ?? -1, method, paidAt });
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
      await call('expenses:create', parsed.data);
      onSaved();
    } catch (caught) {
      setServerError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <p className="text-sm text-ink-soft">La mercadería del kiosco no va acá: su costo se descuenta en cada venta.</p>
      <div className="grid grid-cols-2 gap-4">
        <SelectField
          label="Categoría"
          value={category}
          onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
          error={errors.category}
        >
          {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <MoneyField label="Importe" value={amount} onChange={(event) => setAmount(event.target.value)} error={errors.amountCents} />
      </div>
      <TextField
        label="Detalle"
        value={description}
        placeholder="Por ejemplo: factura de septiembre"
        onChange={(event) => setDescription(event.target.value)}
        error={errors.description}
      />
      <div className="grid grid-cols-2 gap-4">
        <SelectField label="Medio" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
          {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Fecha de pago"
          type="date"
          max={todayIso()}
          value={paidAt}
          onChange={(event) => setPaidAt(event.target.value)}
          error={errors.paidAt}
        />
      </div>
      {serverError && <Notice tone="error">{serverError}</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          Guardar
        </Button>
      </div>
    </form>
  );
}
