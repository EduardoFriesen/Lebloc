import { DomainError } from '../../domain/errors';
import { shiftCostCents } from '../../domain/staff';
import type { EmployeeInput, EmployeeUpdate, PayslipInput, ShiftInput } from '../../shared/schemas';
import type { Employee, EmployeeSummary, Payslip, StaffStats, WorkShift } from '../../shared/types';
import { type Context, nowIso, today } from '../context';
import * as employees from '../repos/employees';
import * as shifts from '../repos/shifts';

function getEmployee(ctx: Context, id: number): Employee {
  const employee = employees.findEmployee(ctx.db, id);
  if (!employee) throw new DomainError('NOT_FOUND');
  return employee;
}

function getShift(ctx: Context, id: number): WorkShift {
  const shift = shifts.findShift(ctx.db, id);
  if (!shift) throw new DomainError('NOT_FOUND');
  return shift;
}

export function createEmployee(ctx: Context, input: EmployeeInput): Employee {
  return getEmployee(ctx, employees.insertEmployee(ctx.db, input));
}

export function updateEmployee(ctx: Context, { id, ...input }: EmployeeUpdate): Employee {
  return ctx.db.transaction(() => {
    getEmployee(ctx, id);
    employees.updateEmployeeRow(ctx.db, id, input);
    return getEmployee(ctx, id);
  })();
}

export function listEmployees(ctx: Context, includeInactive: boolean, month: string): EmployeeSummary[] {
  const totals = new Map(shifts.monthTotals(ctx.db, month).map((row) => [row.employeeId, row]));
  return employees.listEmployeeRows(ctx.db, includeInactive).map((employee) => ({
    ...employee,
    monthMinutes: totals.get(employee.id)?.minutes ?? 0,
    monthCostCents: totals.get(employee.id)?.costCents ?? 0,
  }));
}

/** The rate and the cost come from the stored employee, never from the caller. */
export function recordShift(ctx: Context, input: ShiftInput): WorkShift {
  return ctx.db.transaction(() => {
    const employee = getEmployee(ctx, input.employeeId);
    if (!employee.active) throw new DomainError('EMPLOYEE_INACTIVE');
    if (input.workedOn > today(ctx)) throw new DomainError('DATE_IN_FUTURE');
    const id = shifts.insertShift(ctx.db, {
      ...input,
      hourlyRateCents: employee.hourlyRateCents,
      costCents: shiftCostCents(input.minutes, employee.hourlyRateCents),
      recordedAt: nowIso(ctx),
    });
    return getShift(ctx, id);
  })();
}

export function voidShift(ctx: Context, id: number): WorkShift {
  if (getShift(ctx, id).voidedAt) throw new DomainError('ALREADY_VOIDED');
  shifts.voidShiftRow(ctx.db, id, nowIso(ctx));
  return getShift(ctx, id);
}

export function listShifts(ctx: Context, month: string, employeeId: number | null): WorkShift[] {
  return shifts.listShiftsInMonth(ctx.db, month, employeeId);
}

/** Adds up each shift's own cost snapshot, so a rate change mid-range is paid at both rates. */
export function getPayslip(ctx: Context, { employeeId, from, to }: PayslipInput): Payslip {
  const employee = getEmployee(ctx, employeeId);
  const rows = shifts.listValidShifts(ctx.db, employeeId, from, to);
  return {
    employee,
    shifts: rows,
    totalMinutes: rows.reduce((total, row) => total + row.minutes, 0),
    totalCents: rows.reduce((total, row) => total + row.costCents, 0),
  };
}

export function getStaffStats(ctx: Context, month: string): StaffStats {
  const active = employees.listEmployeeRows(ctx.db, false);
  const totals = shifts.monthTotals(ctx.db, month);
  return {
    active: active.length,
    staff: active.filter((employee) => employee.kind === 'staff').length,
    casual: active.filter((employee) => employee.kind === 'casual').length,
    monthMinutes: totals.reduce((total, row) => total + row.minutes, 0),
    monthCostCents: totals.reduce((total, row) => total + row.costCents, 0),
  };
}
