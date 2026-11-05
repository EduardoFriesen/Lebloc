import type { PaymentMethod } from '../../shared/types';
import { MoneyField, SelectField, TextField } from '../components/ui/Field';
import { todayIso } from '../lib/format';

export type PaymentMode = 'full' | 'partial' | 'none';

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  full: 'Pago completo',
  partial: 'Pago parcial',
  none: 'Sin pago ahora',
};

interface PaymentModeFieldsProps {
  mode: PaymentMode;
  onModeChange: (mode: PaymentMode) => void;
  amount: string;
  onAmountChange: (amount: string) => void;
  method: PaymentMethod;
  onMethodChange: (method: PaymentMethod) => void;
  paidAt: string;
  onPaidAtChange: (paidAt: string) => void;
  amountError?: string;
  paidAtError?: string;
}

/** How much is paid now: all of it, a part or nothing, with its method and date. */
export function PaymentModeFields(props: PaymentModeFieldsProps) {
  const { mode, onModeChange, amount, onAmountChange, method, onMethodChange, paidAt, onPaidAtChange, amountError, paidAtError } = props;
  return (
    <>
      <fieldset className="flex flex-wrap gap-x-6 gap-y-2">
        <legend className="mb-1 text-sm font-semibold text-ink-soft">Pago</legend>
        {(Object.keys(PAYMENT_MODE_LABELS) as PaymentMode[]).map((candidate) => (
          <label key={candidate} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="paymentMode"
              value={candidate}
              checked={mode === candidate}
              onChange={() => onModeChange(candidate)}
              className="accent-accent"
            />
            {PAYMENT_MODE_LABELS[candidate]}
          </label>
        ))}
      </fieldset>
      {mode !== 'none' && (
        <div className="grid gap-3 md:grid-cols-3">
          {mode === 'partial' && (
            <MoneyField label="Monto del pago" value={amount} onChange={(event) => onAmountChange(event.target.value)} error={amountError} />
          )}
          <SelectField
            label="Medio de pago"
            value={method}
            onChange={(event) => onMethodChange(event.target.value === 'transfer' ? 'transfer' : 'cash')}
          >
            <option value="cash">Efectivo</option>
            <option value="transfer">Transferencia</option>
          </SelectField>
          <TextField
            label="Fecha del pago"
            type="date"
            max={todayIso()}
            value={paidAt}
            onChange={(event) => onPaidAtChange(event.target.value)}
            error={paidAtError}
          />
        </div>
      )}
    </>
  );
}
