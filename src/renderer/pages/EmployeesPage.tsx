import { useId, useState } from 'react';
import type { Employee, WorkShift } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { Badge, Card, CardGrid, Stat } from '../components/ui/Card';
import { ConfirmDialog, type ConfirmRequest } from '../components/ui/ConfirmDialog';
import { Dialog } from '../components/ui/Dialog';
import { CheckboxField, TextField } from '../components/ui/Field';
import { PageBar, usePage } from '../components/ui/Pager';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView, EmptyState } from '../components/ui/States';
import { Stripe } from '../components/ui/Stripe';
import {
  ClearFilter,
  STICKY_HEADING,
  SUMMARY_LIST,
  SUMMARY_TOP,
  SummaryTable,
  SummaryValue,
  WITH_SUMMARY,
} from '../components/ui/SummaryTable';
import { FillerRows, TABLE_PAGE_SIZE, tableClass } from '../components/ui/table';
import { call } from '../lib/api';
import { currentMonthIso, EMPLOYEE_KIND_LABELS, formatDate, formatHours, formatMoney, fullName } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { EmployeeForm } from './EmployeeForm';
import { ShiftForm } from './ShiftForm';

const HEADING = 'font-display text-2xl font-semibold';

export function EmployeesPage() {
  const teamId = useId();
  const shiftsId = useId();
  const [month, setMonth] = useState(currentMonthIso());
  const [includeInactive, setIncludeInactive] = useState(false);
  // Picked from a card: the shifts table shows only this employee.
  const [selected, setSelected] = useState<Employee | null>(null);
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  // Open shift form, with the employee it starts on (null: the first active one).
  const [shiftFor, setShiftFor] = useState<{ employeeId: number | null } | null>(null);
  const [pending, setPending] = useState<ConfirmRequest | null>(null);

  const employees = useAsync(() => call('employees:list', { includeInactive, month }), [includeInactive, month], {
    keepPreviousData: true,
  });
  const shifts = useAsync(() => call('shifts:month', { month, employeeId: selected?.id }), [month, selected?.id], {
    keepPreviousData: true,
  });
  const stats = useAsync(() => call('staff:stats', { month }), [month], { keepPreviousData: true });
  const activeEmployees = employees.status === 'success' ? employees.data.filter((employee) => employee.active) : [];

  function reload() {
    employees.reload();
    shifts.reload();
    stats.reload();
  }

  function askVoid(shift: WorkShift) {
    setPending({
      title: 'Anular turno',
      message: `Se anula el turno de ${shift.employeeName} del ${formatDate(shift.workedOn)} (${formatHours(shift.minutes)}). Deja de contar en el costo del mes.`,
      confirmLabel: 'Anular turno',
      action: () => call('shifts:void', { id: shift.id }),
    });
  }

  return (
    <section className={WITH_SUMMARY}>
      <div className={SUMMARY_TOP}>
        <PageHeader
          title="Empleados"
          subtitle="Cada turno se paga por hora y su costo entra en el balance del mes."
          actions={
            <>
              <Button variant="secondary" disabled={activeEmployees.length === 0} onClick={() => setShiftFor({ employeeId: null })}>
                Cargar horas
              </Button>
              <Button onClick={() => setEditing('new')}>Nuevo empleado</Button>
            </>
          }
        />
        <div className="mb-4 flex flex-wrap items-end gap-6">
          <TextField label="Mes" type="month" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} />
          <div className="pb-2">
            <CheckboxField label="Mostrar inactivos" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
          </div>
        </div>
        {selected && <ClearFilter label={fullName(selected)} onClear={() => setSelected(null)} />}
      </div>
      <div className={`${SUMMARY_LIST} flex flex-col gap-6 lg:scroll-pt-16`}>
        <section aria-labelledby={teamId} className="flex flex-col gap-3">
          <h2 id={teamId} className={HEADING}>
            Equipo
          </h2>
          <AsyncView
            state={employees}
            isEmpty={(data) => data.length === 0}
            empty={
              <EmptyState title={includeInactive ? 'Todavía no hay empleados' : 'No hay empleados activos'}>
                <p className="text-sm">Cargá uno con “Nuevo empleado” y después sus horas con “Cargar horas”.</p>
              </EmptyState>
            }
          >
            {(data) => (
              <CardGrid label="Empleados">
                {data.map((employee) => (
                  <Card
                    key={employee.id}
                    onSelect={() => setSelected(employee)}
                    title={fullName(employee)}
                    subtitle={`${formatMoney(employee.hourlyRateCents)} por hora`}
                    muted={!employee.active}
                    badges={
                      <>
                        <Badge>{EMPLOYEE_KIND_LABELS[employee.kind]}</Badge>
                        {!employee.active && <Badge>Inactivo</Badge>}
                      </>
                    }
                    actions={
                      <>
                        {employee.active && (
                          <Button
                            variant="secondary"
                            aria-label={`Cargar horas de ${fullName(employee)}`}
                            onClick={() => setShiftFor({ employeeId: employee.id })}
                          >
                            Cargar horas
                          </Button>
                        )}
                        <Button variant="edit" aria-label={`Editar ${fullName(employee)}`} onClick={() => setEditing(employee)}>
                          Editar
                        </Button>
                      </>
                    }
                  >
                    <dl className="grid grid-cols-2 gap-3">
                      <Stat label="Horas del mes">{formatHours(employee.monthMinutes)}</Stat>
                      <Stat label="Costo del mes">{formatMoney(employee.monthCostCents)}</Stat>
                    </dl>
                  </Card>
                ))}
              </CardGrid>
            )}
          </AsyncView>
        </section>
        <Stripe />
        <section aria-labelledby={shiftsId} className="flex flex-col gap-3">
          <h2 id={shiftsId} className={`${HEADING} ${STICKY_HEADING}`}>
            Turnos
          </h2>
          <AsyncView state={shifts}>
            {(data) => (
              <ShiftsTable
                key={`${month}|${selected?.id ?? ''}`}
                shifts={data}
                empty={selected ? `${fullName(selected)} no tiene turnos este mes` : 'No hay turnos cargados este mes'}
                onVoid={askVoid}
              />
            )}
          </AsyncView>
        </section>
      </div>
      <SummaryTable
        state={stats}
        rows={(data) => [
          { label: 'Activos', value: <SummaryValue count={data.active} /> },
          { label: 'Estables', value: <SummaryValue count={data.staff} /> },
          { label: 'Ocasionales', value: <SummaryValue count={data.casual} /> },
          { label: 'Horas del mes', value: <SummaryValue count={formatHours(data.monthMinutes)} /> },
          { label: 'Costo del mes', value: <SummaryValue count={formatMoney(data.monthCostCents)} /> },
        ]}
      />
      <Dialog open={editing !== null} title={editing === 'new' ? 'Nuevo empleado' : 'Editar empleado'} onClose={() => setEditing(null)}>
        {editing !== null && (
          <EmployeeForm
            employee={editing === 'new' ? null : editing}
            onSaved={() => {
              setEditing(null);
              reload();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
      <Dialog open={shiftFor !== null} title="Cargar horas" onClose={() => setShiftFor(null)}>
        {shiftFor !== null && (
          <ShiftForm
            employees={activeEmployees}
            employeeId={shiftFor.employeeId}
            onSaved={() => {
              setShiftFor(null);
              reload();
            }}
            onCancel={() => setShiftFor(null)}
          />
        )}
      </Dialog>
      <ConfirmDialog
        request={pending}
        onClose={() => setPending(null)}
        onDone={() => {
          setPending(null);
          reload();
        }}
      />
    </section>
  );
}

function ShiftsTable({ shifts, empty, onVoid }: { shifts: WorkShift[]; empty: string; onVoid: (shift: WorkShift) => void }) {
  const { visible, page, pages, setPage } = usePage(shifts, TABLE_PAGE_SIZE);
  return (
    <div className="flex flex-col gap-3">
      <table className={tableClass}>
        <caption className="sr-only">Turnos del mes</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Empleado</th>
            <th scope="col">Horas</th>
            <th scope="col">Valor hora</th>
            <th scope="col">Costo</th>
            <th scope="col">Nota</th>
            <th scope="col">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((shift) => (
            <tr key={shift.id} className={shift.voidedAt ? 'text-ink-soft line-through' : ''}>
              <td>{formatDate(shift.workedOn)}</td>
              <td className="font-semibold">{shift.employeeName}</td>
              <td>{formatHours(shift.minutes)}</td>
              <td>{formatMoney(shift.hourlyRateCents)}</td>
              <td className="font-semibold">{formatMoney(shift.costCents)}</td>
              <td>{shift.note ?? '—'}</td>
              <td className="text-right">
                {shift.voidedAt ? (
                  <span className="inline-block no-underline">
                    <Badge>Anulado</Badge>
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    aria-label={`Anular turno de ${shift.employeeName} del ${formatDate(shift.workedOn)}`}
                    onClick={() => onVoid(shift)}
                  >
                    Anular
                  </Button>
                )}
              </td>
            </tr>
          ))}
          <FillerRows filled={visible.length} columns={7} empty={empty} />
        </tbody>
      </table>
      <PageBar keep label="Turnos" page={page} pages={pages} onChange={setPage} />
    </div>
  );
}
