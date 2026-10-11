import { useId } from 'react';
import { Link } from 'react-router-dom';
import type { DayMovement, DayMovements } from '../../shared/types';
import { formatMoney, PAYMENT_METHOD_LABELS } from '../lib/format';
import type { AsyncResult } from '../lib/useAsync';
import { PageBar, usePage } from './ui/Pager';
import { AsyncView, EmptyState } from './ui/States';
import { tableClass } from './ui/table';

function rowKey(movement: DayMovement) {
  return movement.kind === 'kiosk' ? `k${movement.sale.id}` : `p${movement.paymentId}`;
}

function MovementRow({ movement }: { movement: DayMovement }) {
  if (movement.kind === 'kiosk') {
    const { sale } = movement;
    return (
      <tr>
        <td>Kiosco</td>
        <td>{sale.items.map((item) => `${item.quantity} × ${item.productName}`).join(', ')}</td>
        <td>{PAYMENT_METHOD_LABELS[sale.method]}</td>
        <td className="font-semibold">{formatMoney(sale.totalCents)}</td>
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
    </tr>
  );
}

function MovementsBody({ data }: { data: DayMovements }) {
  const { visible, page, pages, setPage } = usePage(data.rows, 10);
  return (
    <>
      <p className="text-sm">
        Kiosco {formatMoney(data.kioskCents)} · Planes {formatMoney(data.plansCents)} · Total <strong>{formatMoney(data.totalCents)}</strong>
      </p>
      <table className={tableClass}>
        <caption className="sr-only">Movimientos de hoy</caption>
        <thead>
          <tr>
            <th scope="col">Tipo</th>
            <th scope="col">Detalle</th>
            <th scope="col">Medio</th>
            <th scope="col">Monto</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((movement) => (
            <MovementRow key={rowKey(movement)} movement={movement} />
          ))}
        </tbody>
      </table>
      <PageBar label="Movimientos" page={page} pages={pages} onChange={setPage} />
    </>
  );
}

/** Read-only list of today's cash in (kiosk tickets and plan payments); voiding stays in each screen. */
export function DayMovementsTable({ state }: { state: AsyncResult<DayMovements> }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="font-display text-2xl font-semibold">
        Movimientos de hoy
      </h2>
      <AsyncView state={state} isEmpty={(data) => data.rows.length === 0} empty={<EmptyState title="Todavía no hay movimientos hoy" />}>
        {(data) => <MovementsBody data={data} />}
      </AsyncView>
    </section>
  );
}
