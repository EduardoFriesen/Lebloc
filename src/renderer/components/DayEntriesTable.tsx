import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { DayEntry } from '../../shared/types';
import { call } from '../lib/api';
import { COUNTER_SALE_LABELS, formatMoney, formatTime, PASS_KIND_LABELS } from '../lib/format';
import type { AsyncResult } from '../lib/useAsync';
import { Button } from './ui/Button';
import { PassBadge } from './ui/Card';
import { ConfirmDialog, type ConfirmRequest } from './ui/ConfirmDialog';
import { PageBar, usePage } from './ui/Pager';
import { AsyncView } from './ui/States';
import { FillerRows, TABLE_PAGE_SIZE, tableClass } from './ui/table';

function EntryRow({ entry, onVoid }: { entry: DayEntry; onVoid: (request: ConfirmRequest) => void }) {
  if (entry.kind === 'walk_in') {
    const { sale } = entry;
    const label = COUNTER_SALE_LABELS[sale.kind];
    return (
      <tr>
        <td>{formatTime(sale.recordedAt)}</td>
        <td>Pase suelto</td>
        <td>{label}</td>
        <td>—</td>
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
  const kind = PASS_KIND_LABELS[entry.passKind].toLowerCase();
  const time = formatTime(entry.recordedAt);
  return (
    <tr>
      <td>{time}</td>
      <td>
        <Link className="underline" to={`/clientes/${entry.clientId}`}>
          {entry.clientName}
        </Link>
      </td>
      <td>{PASS_KIND_LABELS[entry.passKind]}</td>
      <td>
        <span className="flex flex-wrap items-center gap-2">
          Libres: {entry.remainingFree} · Con profesor: {entry.remainingTeacher}
          <PassBadge status={entry.passStatus} />
        </span>
      </td>
      <td>
        <Button
          variant="ghost"
          aria-label={`Anular pase ${kind} de ${entry.clientName} de las ${time}`}
          onClick={() =>
            onVoid({
              title: 'Anular consumo',
              message: `Se le devuelve a ${entry.clientName} el pase ${kind} de las ${time}.`,
              confirmLabel: 'Anular consumo',
              action: () => call('consumptions:void', { id: entry.consumptionId }),
            })
          }
        >
          Anular
        </Button>
      </td>
    </tr>
  );
}

function EntriesBody({ entries, onVoid }: { entries: DayEntry[]; onVoid: (request: ConfirmRequest) => void }) {
  const { visible, page, pages, setPage } = usePage(entries, TABLE_PAGE_SIZE);
  return (
    <>
      <table className={tableClass}>
        <caption className="sr-only">Ingresos de hoy</caption>
        <thead>
          <tr>
            <th scope="col">Hora</th>
            <th scope="col">Cliente</th>
            <th scope="col">Pase</th>
            <th scope="col">Quedan</th>
            <th scope="col">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((entry) => (
            <EntryRow key={entry.kind === 'pass' ? `p${entry.consumptionId}` : `w${entry.sale.id}`} entry={entry} onVoid={onVoid} />
          ))}
          <FillerRows filled={visible.length} columns={5} empty="Todavía no entró nadie hoy" />
        </tbody>
      </table>
      <PageBar keep label="Ingresos" page={page} pages={pages} onChange={setPage} />
    </>
  );
}

/** Who came in today: client passes and walk-in day passes, each one voidable here when marked by mistake. */
export function DayEntriesTable({ state, onChanged }: { state: AsyncResult<DayEntry[]>; onChanged: () => void }) {
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  return (
    <>
      <AsyncView state={state}>{(entries) => <EntriesBody entries={entries} onVoid={setConfirm} />}</AsyncView>
      <ConfirmDialog
        request={confirm}
        onClose={() => setConfirm(null)}
        onDone={() => {
          setConfirm(null);
          onChanged();
        }}
      />
    </>
  );
}
