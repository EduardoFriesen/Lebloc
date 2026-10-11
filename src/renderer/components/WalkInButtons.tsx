import { useState } from 'react';
import type { CounterPrices, CounterSaleKind, PaymentMethod } from '../../shared/types';
import { call } from '../lib/api';
import { errorMessage } from '../lib/formErrors';
import { formatMoney, PAYMENT_METHOD_LABELS } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { SelectField } from './ui/Field';
import { Notice } from './ui/Notice';

const UNSET_HINT = 'Configurá el precio en Planes';

/** "Pase del día" and "Alquilar pédulas": charged at the counter without a client, at the prices set in Planes. */
export function WalkInButtons({ onSold }: { onSold: () => void }) {
  const prices = useAsync(() => call('prices:get', {}), []);
  const [selling, setSelling] = useState<CounterSaleKind | null>(null);
  const data = prices.status === 'success' ? prices.data : null;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <PriceButton label="Pase del día" cents={data?.dayPassCents} onClick={() => setSelling('day_pass')} />
      <PriceButton label="Alquilar pédulas" cents={data?.shoeRentalCents} onClick={() => setSelling('shoe_rental')} />
      <Dialog open={selling !== null} title={selling === 'day_pass' ? 'Pase del día' : 'Alquilar pédulas'} onClose={() => setSelling(null)}>
        {selling && data && (
          <SellBody
            kind={selling}
            prices={data}
            onCancel={() => setSelling(null)}
            onSold={() => {
              setSelling(null);
              onSold();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function PriceButton({ label, cents, onClick }: { label: string; cents: number | undefined; onClick: () => void }) {
  const unset = cents === 0;
  return (
    <Button variant="secondary" disabled={!cents} title={unset ? UNSET_HINT : undefined} onClick={onClick}>
      {label}
      {cents ? ` ${formatMoney(cents)}` : unset ? ' · sin precio' : ''}
    </Button>
  );
}

function SellBody({ kind, prices, onCancel, onSold }: { kind: CounterSaleKind; prices: CounterPrices; onCancel: () => void; onSold: () => void }) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sell(kinds: CounterSaleKind[]) {
    setBusy(true);
    setError(null);
    try {
      await call('counter:sell', { kinds, method });
      onSold();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  const rental = prices.shoeRentalCents;
  return (
    <>
      <SelectField label="Medio de pago" value={method} onChange={(event) => setMethod(event.target.value === 'transfer' ? 'transfer' : 'cash')}>
        {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((key) => (
          <option key={key} value={key}>
            {PAYMENT_METHOD_LABELS[key]}
          </option>
        ))}
      </SelectField>
      {kind === 'day_pass' ? (
        <p className="text-sm">
          Pase libre por hoy: <strong>{formatMoney(prices.dayPassCents)}</strong>. ¿Alquila pédulas?
          {rental > 0 ? ` (+${formatMoney(rental)})` : ` (${UNSET_HINT.toLowerCase()})`}
        </p>
      ) : (
        <p className="text-sm">
          Alquiler de pédulas: <strong>{formatMoney(rental)}</strong>.
        </p>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
        {kind === 'day_pass' ? (
          <>
            <Button variant="secondary" disabled={busy} onClick={() => void sell(['day_pass'])}>
              No, solo el pase
            </Button>
            <Button disabled={busy || rental <= 0} onClick={() => void sell(['day_pass', 'shoe_rental'])}>
              Sí, con pédulas ({formatMoney(prices.dayPassCents + rental)})
            </Button>
          </>
        ) : (
          <Button disabled={busy} onClick={() => void sell(['shoe_rental'])}>
            Cobrar {formatMoney(rental)}
          </Button>
        )}
      </div>
    </>
  );
}
