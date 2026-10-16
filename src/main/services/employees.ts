import { DomainError } from '../../domain/errors';
import { shiftCostCents } from '../../domain/staff';
import type { EmployeeInput, EmployeeUpdate, PayslipInput, ShiftInput, StaffPayoutInput } from '../../shared/schemas';
import type { Employee, EmployeeSummary, Payslip, StaffPayout, StaffStats, WorkShift } from '../../shared/types';
import { assertNotFuture, type Context, nowIso } from '../context';
import * as employees from '../repos/employees';
import * as shifts from '../repos/shifts';
import * as payouts from '../repos/staffPayouts';

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

function getStaffPayout(ctx: Context, id: number): StaffPayout {
  const payout = payouts.findStaffPayout(ctx.db, id);
  if (!payout) throw new DomainError('NOT_FOUND');
  return payout;
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
  const pending = new Map(shifts.pendingTotals(ctx.db).map((row) => [row.employeeId, row]));
  return employees.listEmployeeRows(ctx.db, includeInactive).map((employee) => ({
    ...employee,
    monthMinutes: totals.get(employee.id)?.minutes ?? 0,
    monthCostCents: totals.get(employee.id)?.costCents ?? 0,
    pendingCents: pending.get(employee.id)?.cents ?? 0,
    pendingSince: pending.get(employee.id)?.since ?? null,
  }));
}

/** The rate and the cost come from the stored employee, never from the caller. */
export function recordShift(ctx: Context, input: ShiftInput): WorkShift {
  return ctx.db.transaction(() => {
    const employee = getEmployee(ctx, input.employeeId);
    if (!employee.active) throw new DomainError('EMPLOYEE_INACTIVE');
    assertNotFuture(ctx, input.workedOn);
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
  const shift = getShift(ctx, id);
  if (shift.voidedAt) throw new DomainError('ALREADY_VOIDED');
  if (shift.payoutId !== null) throw new DomainError('SHIFT_PAID');
  shifts.voidShiftRow(ctx.db, id, nowIso(ctx));
  return getShift(ctx, id);
}

export function listShifts(ctx: Context, month: string, employeeId: number | null): WorkShift[] {
  return shifts.listShiftsInMonth(ctx.db, month, employeeId);
}

const sumCost = (rows: WorkShift[]) => rows.reduce((total, row) => total + row.costCents, 0);

/** Adds up each shift's own cost snapshot, so a rate change mid-range is paid at both rates. */
export function getPayslip(ctx: Context, range: PayslipInput): Payslip {
  const employee = getEmployee(ctx, range.employeeId);
  const rows = shifts.listUnpaidShifts(ctx.db, range);
  return {
    employee,
    shifts: rows,
    totalMinutes: rows.reduce((total, row) => total + row.minutes, 0),
    totalCents: sumCost(rows),
    payouts: payouts.listStaffPayouts(ctx.db, employee.id),
  };
}

/** Pays every unpaid shift of the range at once; the amount comes from the shifts, never from the caller. */
export function settleShifts(ctx: Context, { paidAt, method, ...range }: StaffPayoutInput): StaffPayout {
  return ctx.db.transaction(() => {
    getEmployee(ctx, range.employeeId);
    assertNotFuture(ctx, paidAt);
    const rows = shifts.listUnpaidShifts(ctx.db, range);
    if (rows.length === 0) throw new DomainError('NOTHING_TO_PAY');
    const id = payouts.insertStaffPayout(ctx.db, {
      employeeId: range.employeeId,
      paidAt,
      method,
      amountCents: sumCost(rows),
      recordedAt: nowIso(ctx),
    });
    shifts.payShifts(ctx.db, range, id);
    return getStaffPayout(ctx, id);
  })();
}

/** Its shifts are owed again; the payout keeps its amount as a record. */
export function voidStaffPayout(ctx: Context, id: number): StaffPayout {
  return ctx.db.transaction(() => {
    if (getStaffPayout(ctx, id).voidedAt) throw new DomainError('ALREADY_VOIDED');
    payouts.voidStaffPayoutRow(ctx.db, id, nowIso(ctx));
    shifts.unpayShifts(ctx.db, id);
    return getStaffPayout(ctx, id);
  })();
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
    pendingCents: shifts.pendingTotals(ctx.db).reduce((total, row) => total + row.cents, 0),
  };
}
