import { describe, expect, it } from 'vitest';
import {
  clientInput,
  clientListInput,
  expenseInput,
  financeRangeInput,
  monthInput,
  paymentInput,
  payslipInput,
  planInput,
  planSalesInput,
  scheduleInput,
  settingsInput,
  shiftInput,
} from './schemas';

const client = {
  firstName: '  Ana ',
  lastName: 'Roca',
  birthDate: '1990-05-10',
  address: '   ',
  phone: null,
  emergencyName: null,
  emergencyPhone: null,
  emergencyRelation: null,
  enrolledAt: '2026-10-01',
  guardians: [],
};

describe('schemas', () => {
  it('trims names and turns blank optional text into null', () => {
    const parsed = clientInput.parse(client);
    expect(parsed.firstName).toBe('Ana');
    expect(parsed.address).toBeNull();
  });

  it('rejects empty names and malformed dates', () => {
    expect(clientInput.safeParse({ ...client, firstName: ' ' }).success).toBe(false);
    expect(clientInput.safeParse({ ...client, birthDate: '10/05/1990' }).success).toBe(false);
  });

  it('rejects plans without passes, pointing at freePasses', () => {
    const result = planInput.safeParse({ name: 'Vacío', freePasses: 0, teacherPasses: 0, priceCents: 1000, active: true });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['freePasses']);
  });

  it('rejects schedules that end before they start', () => {
    expect(scheduleInput.safeParse({ weekday: 1, startTime: '18:00', endTime: '17:00' }).success).toBe(false);
    expect(scheduleInput.safeParse({ weekday: 1, startTime: '18:00', endTime: '19:30' }).success).toBe(true);
  });

  it('accepts only positive integer cents for payments', () => {
    const base = { saleId: 1, method: 'cash', paidAt: '2026-10-05' };
    expect(paymentInput.safeParse({ ...base, amountCents: 0 }).success).toBe(false);
    expect(paymentInput.safeParse({ ...base, amountCents: 10.5 }).success).toBe(false);
    expect(paymentInput.safeParse({ ...base, amountCents: 100 }).success).toBe(true);
  });

  it('accepts YYYY-MM months only', () => {
    expect(monthInput.safeParse({ month: '2026-10' }).success).toBe(true);
    expect(monthInput.safeParse({ month: '2026-13' }).success).toBe(false);
    expect(monthInput.safeParse({ month: '10/2026' }).success).toBe(false);
  });

  it('bounds a shift between one minute and 24 hours', () => {
    const base = { employeeId: 1, workedOn: '2026-10-05', note: null };
    expect(shiftInput.safeParse({ ...base, minutes: 0 }).success).toBe(false);
    expect(shiftInput.safeParse({ ...base, minutes: 1441 }).success).toBe(false);
    expect(shiftInput.safeParse({ ...base, minutes: 270 }).success).toBe(true);
  });

  it('rejects unknown expense categories and zero amounts', () => {
    const base = { category: 'rent', description: null, amountCents: 100, method: 'cash', paidAt: '2026-10-05' };
    expect(expenseInput.safeParse(base).success).toBe(true);
    expect(expenseInput.safeParse({ ...base, category: 'groceries' }).success).toBe(false);
    expect(expenseInput.safeParse({ ...base, amountCents: 0 }).success).toBe(false);
  });

  it('accepts finance ranges in order and up to three years', () => {
    expect(financeRangeInput.safeParse({ from: '2026-10-01', to: '2026-10-11' }).success).toBe(true);
    expect(financeRangeInput.safeParse({ from: '2026-10-11', to: '2026-10-01' }).success).toBe(false);
    expect(financeRangeInput.safeParse({ from: '2023-01-01', to: '2026-10-11' }).success).toBe(false);
    expect(financeRangeInput.safeParse({ from: 'ayer', to: '2026-10-11' }).success).toBe(false);
  });

  it('accepts a payslip range in order, the error on the end date', () => {
    expect(payslipInput.safeParse({ employeeId: 1, from: '2026-10-01', to: '2026-10-15' }).success).toBe(true);
    expect(payslipInput.safeParse({ employeeId: 1, from: '2026-10-05', to: '2026-10-05' }).success).toBe(true);
    const reversed = payslipInput.safeParse({ employeeId: 1, from: '2026-10-15', to: '2026-10-01' });
    expect(reversed.success).toBe(false);
    expect(reversed.error?.issues[0]?.path).toEqual(['to']);
    expect(payslipInput.safeParse({ employeeId: 0, from: '2026-10-01', to: '2026-10-15' }).success).toBe(false);
  });

  it('filters plan sales by month and an optional plan', () => {
    expect(planSalesInput.safeParse({ month: '2026-10' }).success).toBe(true);
    expect(planSalesInput.safeParse({ month: '2026-10', planId: 3 }).success).toBe(true);
    expect(planSalesInput.safeParse({ month: '2026-10', planId: -1 }).success).toBe(false);
  });

  it('applies list defaults', () => {
    expect(clientListInput.parse({})).toEqual({ search: '', includeArchived: false, onlyDebtors: false, onlyWithPasses: false, onlyPendingWaiver: false });
  });

  it('accepts a waiver validity between 1 and 120 months', () => {
    expect(settingsInput.safeParse({ lowPassesThreshold: 2, waiverValidityMonths: 0 }).success).toBe(false);
    expect(settingsInput.safeParse({ lowPassesThreshold: 2, waiverValidityMonths: 121 }).success).toBe(false);
    expect(settingsInput.safeParse({ lowPassesThreshold: 2, waiverValidityMonths: 12 }).success).toBe(true);
  });
});
