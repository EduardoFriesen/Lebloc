import { useState } from 'react';
import { monthRange } from '../../domain/periods';
import { payslipInput } from '../../shared/schemas';
import type { DateRange, Employee, Payslip } from '../../shared/types';
import { COMPACT_TABLE } from '../components/charts';
import { Button } from '../components/ui/Button';
import { Stat } from '../components/ui/Card';
import { TextField } from '../components/ui/Field';
import { AsyncView, SkeletonRows } from '../components/ui/States';
import { tableClass } from '../components/ui/table';
import { call } from '../lib/api';
import { EMPLOYEE_KIND_LABELS, formatDate, formatHours, formatMoney, fullName, todayIso } from '../lib/format';
import { toFieldErrors } from '../lib/formErrors';
import { useAsync } from '../lib/useAsync';

interface PayslipViewProps {
  employee: Employee;
  /** The month picked on the page ("YYYY-MM"): the range starts on it. */
  month: string;
  onClose: () => void;
}

/** Hours and pay of one employee between two dates. Only a summary: nothing is recorded as paid. */
export function PayslipView({ employee, month, onClose }: PayslipViewProps) {
  const [draft, setDraft] = useState(() => monthRange(month, todayIso()));
  // The last valid range, so a half-typed date keeps the previous receipt on screen.
  const [range, setRange] = useState(draft);
  const parsed = payslipInput.safeParse({ employeeId: employee.id, ...draft });
  const errors = parsed.success ? {} : toFieldErrors(parsed.error);
  const slip = useAsync(() => call('employees:payslip', { employeeId: employee.id, ...range }), [employee.id, range.from, range.to], {
    keepPreviousData: true,
  });

  function update(next: DateRange) {
    setDraft(next);
    if (payslipInput.safeParse({ employeeId: employee.id, ...next }).success) setRange(next);
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
      <AsyncView
        state={slip}
        skeleton={<SkeletonRows rows={3} />}
        isEmpty={(data) => data.shifts.length === 0}
        empty={
          <p className="rounded-2xl bg-sunken/60 p-4 text-sm">
            No tiene turnos entre el {formatDate(range.from)} y el {formatDate(range.to)}.
          </p>
        }
      >
        {(data) => <PayslipDetail slip={data} />}
      </AsyncView>
      <p className="text-sm text-ink-soft">Es un resumen: no registra el pago ni cambia el balance.</p>
      <div className="flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}

function PayslipDetail({ slip }: { slip: Payslip }) {
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-surface p-4 shadow-warm">
        <Stat label="Horas trabajadas">{formatHours(slip.totalMinutes)}</Stat>
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
