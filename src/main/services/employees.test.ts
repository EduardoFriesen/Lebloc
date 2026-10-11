import { beforeEach, describe, expect, it } from 'vitest';
import type { EmployeeInput } from '../../shared/schemas';
import { expectDomainError } from '../../test/helpers';
import { createTestContext, type TestContext } from '../test-context';
import { createEmployee, getStaffStats, listEmployees, listShifts, recordShift, updateEmployee, voidShift } from './employees';

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
    expect(getStaffStats(ctx, '2026-10')).toEqual({ active: 2, staff: 1, casual: 1, monthMinutes: 390, monthCostCents: 2_850_000 });
  });

  it('fails on unknown employees when updating', () => {
    expectDomainError(() => updateEmployee(ctx, { ...lucia, id: 999 }), 'NOT_FOUND');
  });
});
