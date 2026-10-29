import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DayMovement, DayMovements } from '../../shared/types';
import { call } from '../lib/api';
import { COUNTER_SALE_LABELS, formatMoney, formatTime, PAYMENT_METHOD_LABELS } from '../lib/format';
import type { AsyncResult } from '../lib/useAsync';
import { Button } from './ui/Button';
import { ConfirmDialog, type ConfirmRequest } from './ui/ConfirmDialog';
import { PageBar, usePage } from './ui/Pager';
import { AsyncView } from './ui/States';
import { FillerRows, TABLE_PAGE_SIZE, tableClass } from './ui/table';

function rowKey(movement: DayMovement) {
  return movement.kind === 'plan' ? `p${movement.paymentId}` : `c${movement.sale.id}`;
}

function MovementRow({ movement, onVoid }: { movement: DayMovement; onVoid: (request: ConfirmRequest) => void }) {
  if (movement.kind === 'counter') {
    const { sale } = movement;
    const label = COUNTER_SALE_LABELS[sale.kind];
    return (
      <tr>
        <td>{formatTime(sale.recordedAt)}</td>
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
      <td>{movement.recordedAt ? formatTime(movement.recordedAt) : '—'}</td>
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
  const { visible, page, pages, setPage } = usePage(data.rows, TABLE_PAGE_SIZE);
  return (
    <>
      <p className="text-sm">
        Planes {formatMoney(data.plansCents)} · Pases sueltos {formatMoney(data.counterCents)} · Total{' '}
        <strong>{formatMoney(data.totalCents)}</strong>
      </p>
      <table className={tableClass}>
        <caption className="sr-only">Movimientos de hoy</caption>
        <thead>
          <tr>
            <th scope="col">Hora</th>
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
          <FillerRows filled={visible.length} columns={6} empty="Todavía no hay movimientos hoy" />
        </tbody>
      </table>
      <PageBar keep label="Movimientos" page={page} pages={pages} onChange={setPage} />
    </>
  );
}

/**
 * Today's cash in from passes: plan payments, walk-in passes and shoe rentals (kiosk tickets are in Kiosco). Only the
 * walk-in rows are voided here (they have no screen of their own); payments are voided in the client's file.
 */
export function DayMovementsTable({ state, onChanged }: { state: AsyncResult<DayMovements>; onChanged: () => void }) {
  const headingId = useId();
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="font-display text-lg font-semibold text-ink-soft">
        Movimientos de hoy
      </h3>
      <AsyncView state={state}>{(data) => <MovementsBody data={data} onVoid={setConfirm} />}</AsyncView>
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
