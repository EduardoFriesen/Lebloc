import { useState } from 'react';
import { Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import type { Employee, EmployeeSummary, WorkShift } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { Badge, Card, CardGrid, Stat, StatRow } from '../components/ui/Card';
import { ConfirmDialog, type ConfirmRequest } from '../components/ui/ConfirmDialog';
import { Dialog } from '../components/ui/Dialog';
import { CheckboxField, TextField } from '../components/ui/Field';
import { PageBar, usePage } from '../components/ui/Pager';
import { PageHeader } from '../components/ui/PageHeader';
import { AsyncView, EmptyState } from '../components/ui/States';
import { ClearFilter, SUMMARY_LIST, SUMMARY_TOP, SummaryTable, SummaryValue, WITH_SUMMARY } from '../components/ui/SummaryTable';
import { TabNav } from '../components/ui/TabNav';
import { FillerRows, TABLE_PAGE_SIZE, tableClass } from '../components/ui/table';
import { call } from '../lib/api';
import { currentMonthIso, EMPLOYEE_KIND_LABELS, formatDate, formatHours, formatMoney, fullName } from '../lib/format';
import { matchesSearch } from '../lib/search';
import { type AsyncResult, useAsync } from '../lib/useAsync';
import { EmployeeForm } from './EmployeeForm';
import { PayslipView } from './PayslipView';
import { ShiftForm } from './ShiftForm';

/** What the tabs get from the page: the month's data, the filters and the forms, which the page keeps open over both. */
interface StaffContext {
  month: string;
  /** Typed by name; filters the cards and the shifts alike. */
  search: string;
  employees: AsyncResult<EmployeeSummary[]>;
  shifts: AsyncResult<WorkShift[]>;
  includeInactive: boolean;
  setIncludeInactive: (value: boolean) => void;
  /** Picked from a card: the shifts show only this employee. */
  selected: Employee | null;
  setSelected: (employee: Employee | null) => void;
  edit: (employee: Employee) => void;
  loadHours: (employeeId: number) => void;
  payslip: (employee: EmployeeSummary) => void;
  askVoid: (shift: WorkShift) => void;
}

const TABS = [
  { to: '/empleados', label: 'Equipo', end: true },
  { to: '/empleados/turnos', label: 'Turnos' },
] as const;

/** Header, tabs, the month and the summary; the open tab goes in between. */
export function EmployeesPage() {
  const [month, setMonth] = useState(currentMonthIso());
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  // Open shift form, with the employee it starts on (null: the first active one).
  const [shiftFor, setShiftFor] = useState<{ employeeId: number | null } | null>(null);
  const [pending, setPending] = useState<ConfirmRequest | null>(null);
  const [payslipFor, setPayslipFor] = useState<EmployeeSummary | null>(null);

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

  const context: StaffContext = {
    month,
    search,
    employees,
    shifts,
    includeInactive,
    setIncludeInactive,
    selected,
    setSelected,
    edit: setEditing,
    loadHours: (employeeId) => setShiftFor({ employeeId }),
    payslip: setPayslipFor,
    askVoid,
  };

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
        <div className="mb-4 border-b border-ink/10">
          <TabNav label="Secciones de empleados" tabs={TABS} />
        </div>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <TextField label="Mes" type="month" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} />
          <TextField label="Buscar empleado" type="search" placeholder="Nombre o apellido" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
      </div>
      <div className={`${SUMMARY_LIST} flex flex-col gap-4`}>
        <Outlet context={context} />
      </div>
      <SummaryTable
        state={stats}
        rows={(data) => [
          { label: 'Activos', value: <SummaryValue count={data.active} /> },
          { label: 'Estables', value: <SummaryValue count={data.staff} /> },
          { label: 'Ocasionales', value: <SummaryValue count={data.casual} /> },
          { label: 'Horas del mes', value: <SummaryValue count={formatHours(data.monthMinutes)} /> },
          { label: 'Costo del mes', value: <SummaryValue count={formatMoney(data.monthCostCents)} /> },
          { label: 'A pagar', value: <SummaryValue count={formatMoney(data.pendingCents)} /> },
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
      <Dialog open={payslipFor !== null} title="Liquidación de sueldo" onClose={() => setPayslipFor(null)}>
        {payslipFor !== null && <PayslipView employee={payslipFor} month={month} onChange={reload} onClose={() => setPayslipFor(null)} />}
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

/** The employees as cards, with the month's hours and cost; a card opens its shifts. */
export function TeamTab() {
  const { search, employees, includeInactive, setIncludeInactive, setSelected, edit, loadHours, payslip } = useOutletContext<StaffContext>();
  const navigate = useNavigate();
  const shown = (data: EmployeeSummary[]) => data.filter((employee) => matchesSearch(fullName(employee), search));
  return (
    <section aria-label="Equipo" className="flex flex-col gap-4">
      <CheckboxField label="Mostrar inactivos" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
      <AsyncView
        state={employees}
        isEmpty={(data) => shown(data).length === 0}
        empty={
          search.trim() ? (
            <EmptyState title={`Ningún empleado coincide con “${search.trim()}”`} />
          ) : (
            <EmptyState title={includeInactive ? 'Todavía no hay empleados' : 'No hay empleados activos'}>
              <p className="text-sm">Cargá uno con “Nuevo empleado” y después sus horas con “Cargar horas”.</p>
            </EmptyState>
          )
        }
      >
        {(data) => (
          <CardGrid label="Empleados">
            {shown(data).map((employee) => (
              <Card
                key={employee.id}
                onSelect={() => {
                  setSelected(employee);
                  void navigate('/empleados/turnos');
                }}
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
                      <Button variant="secondary" aria-label={`Cargar horas de ${fullName(employee)}`} onClick={() => loadHours(employee.id)}>
                        Cargar horas
                      </Button>
                    )}
                    <Button variant="primary" aria-label={`Liquidar sueldo de ${fullName(employee)}`} onClick={() => payslip(employee)}>
                      Liquidar
                    </Button>
                    <Button variant="edit" aria-label={`Editar ${fullName(employee)}`} onClick={() => edit(employee)}>
                      Editar
                    </Button>
                  </>
                }
              >
                <StatRow>
                  <Stat label="Horas del mes">{formatHours(employee.monthMinutes)}</Stat>
                  <Stat label="Costo del mes">{formatMoney(employee.monthCostCents)}</Stat>
                  <Stat label="A pagar">{formatMoney(employee.pendingCents)}</Stat>
                </StatRow>
              </Card>
            ))}
          </CardGrid>
        )}
      </AsyncView>
    </section>
  );
}

/** The month's shifts, of everyone or of the employee picked from a card. */
export function ShiftsTab() {
  const { month, search, shifts, selected, setSelected, askVoid } = useOutletContext<StaffContext>();
  return (
    <section aria-label="Turnos" className="flex flex-col gap-3">
      {selected && <ClearFilter label={fullName(selected)} onClear={() => setSelected(null)} />}
      <AsyncView state={shifts}>
        {(data) => (
          <ShiftsTable
            key={`${month}|${selected?.id ?? ''}|${search}`}
            shifts={data.filter((shift) => matchesSearch(shift.employeeName, search))}
            empty={
              search.trim()
                ? `Ningún turno coincide con “${search.trim()}”`
                : selected
                  ? `${fullName(selected)} no tiene turnos este mes`
                  : 'No hay turnos cargados este mes'
            }
            onVoid={askVoid}
          />
        )}
      </AsyncView>
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
              {/* The month is picked above: day and month are enough, and keep the table within the page. */}
              <td className="tabular-nums">{formatDate(shift.workedOn).slice(0, 5)}</td>
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
                ) : shift.payoutId !== null ? (
                  <Badge>Pagado</Badge>
                ) : (
                  <Button
                    variant="danger-outline"
                    className="px-3!"
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
