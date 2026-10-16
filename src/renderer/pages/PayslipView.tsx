import { useState } from 'react';
import { monthRange } from '../../domain/periods';
import { payslipInput, staffPayoutInput } from '../../shared/schemas';
import type { DateRange, EmployeeSummary, PaymentMethod, Payslip, StaffPayout } from '../../shared/types';
import { COMPACT_TABLE } from '../components/charts';
import { Button } from '../components/ui/Button';
import { Stat } from '../components/ui/Card';
import { ConfirmDialog, type ConfirmRequest } from '../components/ui/ConfirmDialog';
import { SelectField, TextField } from '../components/ui/Field';
import { Notice, type NoticeState } from '../components/ui/Notice';
import { PageBar, usePage } from '../components/ui/Pager';
import { AsyncView, SkeletonRows } from '../components/ui/States';
import { FillerRows, tableClass } from '../components/ui/table';
import { call } from '../lib/api';
import { EMPLOYEE_KIND_LABELS, formatDate, formatHours, formatMoney, fullName, PAYMENT_METHOD_LABELS, todayIso } from '../lib/format';
import { errorMessage, toFieldErrors } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';

const PAYOUTS_PAGE_SIZE = 4;

interface PayslipViewProps {
  employee: EmployeeSummary;
  /** The month picked on the page ("YYYY-MM"): the range starts on it. */
  month: string;
  /** After a settlement is recorded or voided, so the page shows what is owed. */
  onChange: () => void;
  onClose: () => void;
}

/** The month, stretched back to the oldest unpaid shift so the receipt starts with everything owed. */
function initialRange(employee: EmployeeSummary, month: string): DateRange {
  const range = monthRange(month, todayIso());
  return employee.pendingSince !== null && employee.pendingSince < range.from ? { ...range, from: employee.pendingSince } : range;
}

/** The unpaid hours of one employee between two dates; confirming pays them and they stop being owed. */
export function PayslipView({ employee, month, onChange, onClose }: PayslipViewProps) {
  const [draft, setDraft] = useState(() => initialRange(employee, month));
  // The last valid range, so a half-typed date keeps the previous receipt on screen.
  const [range, setRange] = useState(draft);
  const [paidAt, setPaidAt] = useState(todayIso());
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [pending, setPending] = useState<ConfirmRequest | null>(null);
  const parsed = payslipInput.safeParse({ employeeId: employee.id, ...draft });
  const errors = parsed.success ? {} : toFieldErrors(parsed.error);
  const payout = staffPayoutInput.safeParse({ employeeId: employee.id, ...range, paidAt, method });
  const payoutErrors = payout.success ? {} : toFieldErrors(payout.error);
  const slip = useAsync(() => call('employees:payslip', { employeeId: employee.id, ...range }), [employee.id, range.from, range.to], {
    keepPreviousData: true,
  });

  function update(next: DateRange) {
    setDraft(next);
    if (payslipInput.safeParse({ employeeId: employee.id, ...next }).success) setRange(next);
  }

  function changed() {
    slip.reload();
    onChange();
  }

  async function settle() {
    if (!payout.success) return;
    setBusy(true);
    setNotice(null);
    try {
      await call('employees:settle', payout.data);
      setNotice({ tone: 'success', text: 'Liquidación registrada: ya no tiene horas a pagar en ese rango.' });
      changed();
    } catch (caught) {
      setNotice({ tone: 'error', text: errorMessage(caught) });
    } finally {
      setBusy(false);
    }
  }

  function askVoid(row: StaffPayout) {
    setNotice(null);
    setPending({
      title: 'Anular liquidación',
      message: `Se anula la liquidación del ${formatDate(row.paidAt)} por ${formatMoney(row.amountCents)} y sus turnos vuelven a quedar a pagar.`,
      confirmLabel: 'Anular liquidación',
      action: () => call('employees:voidPayout', { id: row.id }),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p>
        <span className="font-semibold">{fullName(employee)}</span>
        <span className="text-ink-soft">
          {' '}
          · {EMPLOYEE_KIND_LABELS[employee.kind]}
          {employee.dni && ` · DNI ${employee.dni}`}
        </span>
      </p>
      <div className="flex flex-wrap items-start gap-3">
        <TextField label="Desde" type="date" value={draft.from} onChange={(event) => update({ ...draft, from: event.target.value })} error={errors.from} />
        <TextField label="Hasta" type="date" value={draft.to} onChange={(event) => update({ ...draft, to: event.target.value })} error={errors.to} />
      </div>
      <AsyncView state={slip} skeleton={<SkeletonRows rows={3} />}>
        {(data) => (
          <>
            {data.shifts.length === 0 ? (
              <p className="rounded-2xl bg-sunken/60 p-4 text-sm">
                No tiene turnos sin pagar entre el {formatDate(range.from)} y el {formatDate(range.to)}.
              </p>
            ) : (
              <>
                <PayslipDetail slip={data} />
                <div className="flex flex-wrap items-start gap-3">
                  <TextField
                    label="Fecha de pago"
                    type="date"
                    max={todayIso()}
                    value={paidAt}
                    onChange={(event) => setPaidAt(event.target.value)}
                    error={payoutErrors.paidAt}
                  />
                  <SelectField label="Medio de pago" value={method} onChange={(event) => setMethod(event.target.value === 'transfer' ? 'transfer' : 'cash')}>
                    <option value="cash">Efectivo</option>
                    <option value="transfer">Transferencia</option>
                  </SelectField>
                </div>
                <p className="text-sm text-ink-soft">Estos turnos quedan pagados. Su costo sigue contando en el balance del mes en que se trabajaron.</p>
              </>
            )}
            {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cerrar
              </Button>
              {data.shifts.length > 0 && (
                <Button disabled={busy || !parsed.success || !payout.success} onClick={() => void settle()}>
                  Confirmar liquidación
                </Button>
              )}
            </div>
            <PayoutsTable payouts={data.payouts} onVoid={askVoid} />
          </>
        )}
      </AsyncView>
      <ConfirmDialog
        request={pending}
        onClose={() => setPending(null)}
        onDone={() => {
          setPending(null);
          setNotice({ tone: 'success', text: 'Liquidación anulada: sus turnos vuelven a estar a pagar.' });
          changed();
        }}
      />
    </div>
  );
}

function PayslipDetail({ slip }: { slip: Payslip }) {
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-surface p-4 shadow-warm">
        <Stat label="Horas a pagar">{formatHours(slip.totalMinutes)}</Stat>
        <Stat label="Total a pagar">{formatMoney(slip.totalCents)}</Stat>
      </dl>
      <table className={`${tableClass} ${COMPACT_TABLE}`}>
        <caption className="sr-only">Turnos de la liquidación</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Horas</th>
            <th scope="col">Valor hora</th>
            <th scope="col">Importe</th>
          </tr>
        </thead>
        <tbody>
          {slip.shifts.map((shift) => (
            <tr key={shift.id}>
              <td className="tabular-nums">{formatDate(shift.workedOn)}</td>
              <td className="tabular-nums">{formatHours(shift.minutes)}</td>
              <td className="tabular-nums">{formatMoney(shift.hourlyRateCents)}</td>
              <td className="font-semibold tabular-nums">{formatMoney(shift.costCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PayoutsTable({ payouts, onVoid }: { payouts: StaffPayout[]; onVoid: (payout: StaffPayout) => void }) {
  const { visible, page, pages, setPage } = usePage(payouts, PAYOUTS_PAGE_SIZE);
  return (
    <section aria-labelledby="staff-payouts-title" className="flex flex-col gap-2">
      <h3 id="staff-payouts-title" className="font-semibold">
        Liquidaciones
      </h3>
      <table className={`${tableClass} ${COMPACT_TABLE}`}>
        <thead>
          <tr>
            <th scope="col">Pagada el</th>
            <th scope="col">Medio</th>
            <th scope="col">Importe</th>
            <th scope="col">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((payout) => (
            <tr key={payout.id} className={payout.voidedAt ? 'text-ink-soft' : ''}>
              <td className="tabular-nums">{formatDate(payout.paidAt)}</td>
              <td>{PAYMENT_METHOD_LABELS[payout.method]}</td>
              <td className="font-semibold tabular-nums">{formatMoney(payout.amountCents)}</td>
              <td className="text-right">
                {payout.voidedAt ? (
                  'Anulada'
                ) : (
                  <Button variant="ghost" aria-label={`Anular liquidación del ${formatDate(payout.paidAt)}`} onClick={() => onVoid(payout)}>
                    Anular
                  </Button>
                )}
              </td>
            </tr>
          ))}
          <FillerRows filled={visible.length} columns={4} size={pages > 1 ? PAYOUTS_PAGE_SIZE : 1} empty="Todavía no hay liquidaciones" />
        </tbody>
      </table>
      <PageBar label="Liquidaciones" page={page} pages={pages} onChange={setPage} />
    </section>
  );
}
