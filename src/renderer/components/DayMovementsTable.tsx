import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DayMovement, DayMovements } from '../../shared/types';
import { call } from '../lib/api';
import { COUNTER_SALE_LABELS, formatMoney, formatTime, PAYMENT_METHOD_LABELS } from '../lib/format';
import type { AsyncResult } from '../lib/useAsync';
import { Button } from './ui/Button';
import { ConfirmDialog, type ConfirmRequest } from './ui/ConfirmDialog';
import { PageBar, usePage } from './ui/Pager';
import { AsyncView, EmptyState } from './ui/States';
import { tableClass } from './ui/table';

function rowKey(movement: DayMovement) {
  if (movement.kind === 'plan') return `p${movement.paymentId}`;
  return `${movement.kind === 'kiosk' ? 'k' : 'c'}${movement.sale.id}`;
}

function MovementRow({ movement, onVoid }: { movement: DayMovement; onVoid: (request: ConfirmRequest) => void }) {
  if (movement.kind === 'kiosk') {
    const { sale } = movement;
    return (
      <tr>
        <td>Kiosco</td>
        <td>{sale.items.map((item) => `${item.quantity} × ${item.productName}`).join(', ')}</td>
        <td>{PAYMENT_METHOD_LABELS[sale.method]}</td>
        <td className="font-semibold">{formatMoney(sale.totalCents)}</td>
        <td />
      </tr>
    );
  }
  if (movement.kind === 'counter') {
    const { sale } = movement;
    const label = COUNTER_SALE_LABELS[sale.kind];
    return (
      <tr>
        <td>Pase suelto</td>
        <td>{label}</td>
        <td>{PAYMENT_METHOD_LABELS[sale.method]}</td>
        <td className="font-semibold">{formatMoney(sale.priceCents)}</td>
        <td>
          <Button
            variant="ghost"
            aria-label={`Anular ${label.toLowerCase()} de las ${formatTime(sale.recordedAt)}`}
            onClick={() =>
              onVoid({
                title: `Anular ${label.toLowerCase()}`,
                message: `Se anula el cobro de ${formatMoney(sale.priceCents)} de las ${formatTime(sale.recordedAt)}. Queda registrado como anulado.`,
                confirmLabel: 'Anular',
                action: () => call('counter:void', { id: sale.id }),
              })
            }
          >
            Anular
          </Button>
        </td>
      </tr>
    );
  }
  return (
    <tr>
      <td>Plan</td>
      <td>
        <Link className="underline" to={`/clientes/${movement.clientId}`}>
          {movement.clientName} · {movement.planName}
        </Link>
        <span className="block text-xs text-ink-soft">
          total {formatMoney(movement.saleTotalCents)}
          {movement.debtCents > 0 && ` · debe ${formatMoney(movement.debtCents)}`}
        </span>
      </td>
      <td>{PAYMENT_METHOD_LABELS[movement.method]}</td>
      <td className="font-semibold">{formatMoney(movement.amountCents)}</td>
      <td />
    </tr>
  );
}

function MovementsBody({ data, onVoid }: { data: DayMovements; onVoid: (request: ConfirmRequest) => void }) {
  const { visible, page, pages, setPage } = usePage(data.rows, 10);
  return (
    <>
      <p className="text-sm">
        Kiosco {formatMoney(data.kioskCents)} · Planes {formatMoney(data.plansCents)} · Pases sueltos {formatMoney(data.counterCents)} · Total{' '}
        <strong>{formatMoney(data.totalCents)}</strong>
      </p>
      <table className={tableClass}>
        <caption className="sr-only">Movimientos de hoy</caption>
        <thead>
          <tr>
            <th scope="col">Tipo</th>
            <th scope="col">Detalle</th>
            <th scope="col">Medio</th>
            <th scope="col">Monto</th>
            <th scope="col">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((movement) => (
            <MovementRow key={rowKey(movement)} movement={movement} onVoid={onVoid} />
          ))}
        </tbody>
      </table>
      <PageBar label="Movimientos" page={page} pages={pages} onChange={setPage} />
    </>
  );
}

/**
 * Today's cash in: plan payments, kiosk tickets, walk-in passes and shoe rentals. Only the walk-in rows are voided
 * here (they have no screen of their own); payments and tickets are voided in their screens.
 */
export function DayMovementsTable({ state, onChanged }: { state: AsyncResult<DayMovements>; onChanged: () => void }) {
  const headingId = useId();
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="font-display text-2xl font-semibold">
        Movimientos de hoy
      </h2>
      <AsyncView state={state} isEmpty={(data) => data.rows.length === 0} empty={<EmptyState title="Todavía no hay movimientos hoy" />}>
        {(data) => <MovementsBody data={data} onVoid={setConfirm} />}
      </AsyncView>
      <ConfirmDialog
        request={confirm}
        onClose={() => setConfirm(null)}
        onDone={() => {
          setConfirm(null);
          onChanged();
        }}
      />
    </section>
  );
}
