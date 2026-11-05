import { beforeEach, describe, expect, it } from 'vitest';
import type { EmployeeInput } from '../../shared/schemas';
import { expectDomainError } from '../../test/helpers';
import { createTestContext, type TestContext } from '../test-context';
import {
  createEmployee,
  getPayslip,
  getStaffStats,
  listEmployees,
  listShifts,
  recordShift,
  settleShifts,
  updateEmployee,
  voidShift,
  voidStaffPayout,
} from './employees';

const lucia: EmployeeInput = {
  firstName: 'Lucía',
  lastName: 'Paz',
  dni: null,
  phone: null,
  address: null,
  kind: 'staff',
  hourlyRateCents: 500_000,
  active: true,
};

describe('employees and shifts', () => {
  let ctx: TestContext;
  let luciaId: number;

  beforeEach(() => {
    ctx = createTestContext(); // today: 2026-10-05
    luciaId = createEmployee(ctx, lucia).id;
  });

  const shift = (overrides: Partial<{ employeeId: number; workedOn: string; minutes: number }> = {}) =>
    recordShift(ctx, { employeeId: luciaId, workedOn: '2026-10-04', minutes: 270, note: null, ...overrides });

  it('records a shift with a snapshot of the rate and its cost', () => {
    expect(shift()).toEqual({
      id: expect.any(Number),
      employeeId: luciaId,
      employeeName: 'Lucía Paz',
      workedOn: '2026-10-04',
      minutes: 270,
      hourlyRateCents: 500_000,
      costCents: 2_250_000,
      note: null,
      recordedAt: ctx.clock.now().toISOString(),
      voidedAt: null,
      payoutId: null,
    });
  });

  it('keeps old shifts at the old rate when the rate changes', () => {
    shift();
    updateEmployee(ctx, { ...lucia, id: luciaId, hourlyRateCents: 600_000 });
    shift({ minutes: 60 });
    expect(listShifts(ctx, '2026-10', null).map((row) => row.costCents)).toEqual([600_000, 2_250_000]);
  });

  it('rejects future dates, inactive and unknown employees without inserting', () => {
    expectDomainError(() => shift({ workedOn: '2026-10-06' }), 'DATE_IN_FUTURE');
    expectDomainError(() => shift({ employeeId: 999 }), 'NOT_FOUND');
    updateEmployee(ctx, { ...lucia, id: luciaId, active: false });
    expectDomainError(() => shift(), 'EMPLOYEE_INACTIVE');
    expect(listShifts(ctx, '2026-10', null)).toEqual([]);
  });

  it('voids a shift once', () => {
    const { id } = shift();
    expect(voidShift(ctx, id).voidedAt).toBe(ctx.clock.now().toISOString());
    expectDomainError(() => voidShift(ctx, id), 'ALREADY_VOIDED');
    expectDomainError(() => voidShift(ctx, 999), 'NOT_FOUND');
  });

  it('adds up hours and cost of the month per employee, without voided shifts', () => {
    const marcosId = createEmployee(ctx, { ...lucia, firstName: 'Marcos', kind: 'casual', hourlyRateCents: 300_000 }).id;
    createEmployee(ctx, { ...lucia, firstName: 'Eva', active: false });
    shift();
    shift({ workedOn: '2026-09-30', minutes: 60 });
    voidShift(ctx, shift({ minutes: 600 }).id);
    shift({ employeeId: marcosId, minutes: 120 });

    expect(listEmployees(ctx, false, '2026-10').map(({ firstName, monthMinutes, monthCostCents }) => [firstName, monthMinutes, monthCostCents])).toEqual([
      ['Lucía', 270, 2_250_000],
      ['Marcos', 120, 600_000],
    ]);
    expect(listEmployees(ctx, true, '2026-10')).toHaveLength(3);
    expect(listShifts(ctx, '2026-10', marcosId)).toHaveLength(1);
    expect(getStaffStats(ctx, '2026-10')).toEqual({
      active: 2,
      staff: 1,
      casual: 1,
      monthMinutes: 390,
      monthCostCents: 2_850_000,
      pendingCents: 3_350_000,
    });
  });

  describe('payslip', () => {
    it("adds up the range's valid shifts, each at the rate it was recorded with, oldest first", () => {
      const marcosId = createEmployee(ctx, { ...lucia, firstName: 'Marcos' }).id;
      shift({ workedOn: '2026-09-30', minutes: 60 });
      const first = shift({ workedOn: '2026-10-01', minutes: 270 });
      voidShift(ctx, shift({ workedOn: '2026-10-02', minutes: 600 }).id);
      shift({ employeeId: marcosId, workedOn: '2026-10-02', minutes: 120 });
      updateEmployee(ctx, { ...lucia, id: luciaId, hourlyRateCents: 600_000 });
      const last = shift({ workedOn: '2026-10-04', minutes: 90 });
      shift({ workedOn: '2026-10-05', minutes: 60 });

      const slip = getPayslip(ctx, { employeeId: luciaId, from: '2026-10-01', to: '2026-10-04' });

      expect(slip.employee).toMatchObject({ id: luciaId, firstName: 'Lucía', hourlyRateCents: 600_000 });
      expect(slip.shifts.map((row) => row.id)).toEqual([first.id, last.id]);
      expect(slip.totalMinutes).toBe(360);
      expect(slip.totalCents).toBe(2_250_000 + 900_000);
    });

    it('still settles an employee who is no longer active', () => {
      shift();
      updateEmployee(ctx, { ...lucia, id: luciaId, active: false });
      expect(getPayslip(ctx, { employeeId: luciaId, from: '2026-10-01', to: '2026-10-31' }).totalCents).toBe(2_250_000);
    });

    it('comes back empty for a range without shifts and fails on unknown employees', () => {
      expect(getPayslip(ctx, { employeeId: luciaId, from: '2026-10-01', to: '2026-10-31' })).toMatchObject({ shifts: [], totalMinutes: 0, totalCents: 0 });
      expectDomainError(() => getPayslip(ctx, { employeeId: 999, from: '2026-10-01', to: '2026-10-31' }), 'NOT_FOUND');
    });
  });

  describe('settling', () => {
    const settle = (overrides: Partial<{ employeeId: number; from: string; to: string; paidAt: string }> = {}) =>
      settleShifts(ctx, { employeeId: luciaId, from: '2026-10-01', to: '2026-10-31', paidAt: '2026-10-05', method: 'cash', ...overrides });
    const owed = () => listEmployees(ctx, true, '2026-10').find((employee) => employee.id === luciaId);
    const october = () => getPayslip(ctx, { employeeId: luciaId, from: '2026-10-01', to: '2026-10-31' });

    it("pays the range's unpaid shifts, so they stop being owed", () => {
      shift({ workedOn: '2026-09-30', minutes: 60 });
      const paid = shift();
      voidShift(ctx, shift({ minutes: 600 }).id);
      expect(owed()).toMatchObject({ pendingCents: 500_000 + 2_250_000, pendingSince: '2026-09-30' });

      const payout = settle();

      expect(payout).toEqual({ id: expect.any(Number), employeeId: luciaId, paidAt: '2026-10-05', amountCents: 2_250_000, method: 'cash', voidedAt: null });
      expect(owed()).toMatchObject({ pendingCents: 500_000, pendingSince: '2026-09-30', monthCostCents: 2_250_000 });
      expect(listShifts(ctx, '2026-10', luciaId).find((row) => row.id === paid.id)?.payoutId).toBe(payout.id);
      expect(october()).toMatchObject({ shifts: [], totalMinutes: 0, totalCents: 0, payouts: [payout] });
      expect(getStaffStats(ctx, '2026-10').pendingCents).toBe(500_000);
    });

    it('leaves nothing owed once every shift is paid', () => {
      shift({ workedOn: '2026-09-30', minutes: 60 });
      shift();
      settle({ from: '2026-09-30' });
      expect(owed()).toMatchObject({ pendingCents: 0, pendingSince: null });
    });

    it('never pays a shift twice, nor a range without unpaid shifts', () => {
      shift();
      settle();
      expectDomainError(() => settle(), 'NOTHING_TO_PAY');
      expectDomainError(() => settle({ from: '2026-09-01', to: '2026-09-30' }), 'NOTHING_TO_PAY');
    });

    it('rejects future pay dates and unknown employees without paying', () => {
      shift();
      expectDomainError(() => settle({ paidAt: '2026-10-06' }), 'DATE_IN_FUTURE');
      expectDomainError(() => settle({ employeeId: 999 }), 'NOT_FOUND');
      expect(owed()?.pendingCents).toBe(2_250_000);
    });

    it('voids a settlement once and owes its shifts again', () => {
      shift();
      const payout = settle();
      const voided = voidStaffPayout(ctx, payout.id);
      expect(voided).toEqual({ ...payout, voidedAt: ctx.clock.now().toISOString() });
      expect(owed()?.pendingCents).toBe(2_250_000);
      expectDomainError(() => voidStaffPayout(ctx, payout.id), 'ALREADY_VOIDED');
      expectDomainError(() => voidStaffPayout(ctx, 999), 'NOT_FOUND');

      const again = settle();
      expect(october().payouts).toEqual([again, voided]);
    });

    it('keeps a paid shift from being voided', () => {
      const { id } = shift();
      const payout = settle();
      expectDomainError(() => voidShift(ctx, id), 'SHIFT_PAID');
      voidStaffPayout(ctx, payout.id);
      expect(voidShift(ctx, id).voidedAt).not.toBeNull();
    });
  });

  it('fails on unknown employees when updating', () => {
    expectDomainError(() => updateEmployee(ctx, { ...lucia, id: 999 }), 'NOT_FOUND');
  });
});
