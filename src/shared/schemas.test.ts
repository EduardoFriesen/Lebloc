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
  purchaseInput,
  saleInput,
  scheduleInput,
  settingsInput,
  shiftInput,
  financeSummaryInput,
  staffPayoutInput,
} from './schemas';

const client = {
  firstName: '  Ana ',
  lastName: 'Roca',
  birthDate: '1990-05-10',
  dni: ' 30111222 ',
  notes: '',
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
    expect(parsed.dni).toBe('30111222');
    expect(parsed.notes).toBeNull();
  });

  it('rejects empty names and malformed dates', () => {
    expect(clientInput.safeParse({ ...client, firstName: ' ' }).success).toBe(false);
    expect(clientInput.safeParse({ ...client, birthDate: '10/05/1990' }).success).toBe(false);
  });

  it('rejects plans without passes, pointing at freePasses', () => {
    const result = planInput.safeParse({ name: 'Vacío', freePasses: 0, teacherPasses: 0, priceCents: 1000, teacherAmountCents: 0, active: true });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['freePasses']);
  });

  it('requires an amount for the teacher only when the plan has teacher passes', () => {
    const plan = { name: 'Pack 4+4', freePasses: 4, teacherPasses: 4, priceCents: 1000, teacherAmountCents: 500, active: true };
    expect(planInput.safeParse(plan).success).toBe(true);
    const missing = planInput.safeParse({ ...plan, teacherAmountCents: 0 });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0]?.path).toEqual(['teacherAmountCents']);
    expect(planInput.safeParse({ ...plan, teacherPasses: 0, teacherAmountCents: 0 }).success).toBe(true);
    expect(planInput.safeParse({ ...plan, teacherPasses: 0 }).success).toBe(false);
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

  it('narrows the finance summary to one payment method, or none for the total', () => {
    const range = { from: '2026-10-01', to: '2026-10-31' };
    expect(financeSummaryInput.parse(range)).toEqual(range);
    expect(financeSummaryInput.parse({ ...range, method: 'transfer' })).toEqual({ ...range, method: 'transfer' });
    expect(financeSummaryInput.safeParse({ ...range, method: 'card' }).success).toBe(false);
    expect(financeSummaryInput.safeParse({ ...range, from: '2026-11-01' }).success).toBe(false);
  });

  it('settles a range of shifts with a pay date and a method', () => {
    const payout = { employeeId: 1, from: '2026-10-01', to: '2026-10-31', paidAt: '2026-10-05', method: 'cash' };
    expect(staffPayoutInput.safeParse(payout).success).toBe(true);
    expect(staffPayoutInput.safeParse({ ...payout, from: '2026-11-01' }).error?.issues[0]?.path).toEqual(['to']);
    expect(staffPayoutInput.safeParse({ ...payout, method: 'card' }).success).toBe(false);
    expect(staffPayoutInput.safeParse({ ...payout, paidAt: '05/10/2026' }).success).toBe(false);
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
    const settings = { lowPassesThreshold: 2, expiryWarningDays: 7 };
    expect(settingsInput.safeParse({ ...settings, waiverValidityMonths: 0 }).success).toBe(false);
    expect(settingsInput.safeParse({ ...settings, waiverValidityMonths: 121 }).success).toBe(false);
    expect(settingsInput.safeParse({ ...settings, waiverValidityMonths: 12 }).success).toBe(true);
  });

  it('accepts warning about expiry from 0 to 60 days ahead', () => {
    const settings = { lowPassesThreshold: 2, waiverValidityMonths: 12 };
    expect(settingsInput.safeParse({ ...settings, expiryWarningDays: 0 }).success).toBe(true);
    expect(settingsInput.safeParse({ ...settings, expiryWarningDays: 61 }).success).toBe(false);
  });

  it('rejects a sale that expires before it was sold, pointing at expiresAt', () => {
    const sale = { clientId: 1, planId: 1, teacherId: null, splitRule: 'proportional', soldAt: '2026-10-27', initialPayment: null };
    expect(saleInput.safeParse({ ...sale, expiresAt: '2026-10-27' }).success).toBe(true);
    const early = saleInput.safeParse({ ...sale, expiresAt: '2026-10-26' });
    expect(early.success).toBe(false);
    expect(early.error?.issues[0]?.path).toEqual(['expiresAt']);
  });

  it('takes a delivery with at least one line and whole positive quantities', () => {
    const delivery = { paidAt: '2026-10-02', method: 'cash', items: [{ productId: 1, quantity: 24, costCents: 1_200_000 }] };
    expect(purchaseInput.safeParse(delivery).success).toBe(true);
    expect(purchaseInput.safeParse({ ...delivery, items: [] }).success).toBe(false);
    expect(purchaseInput.safeParse({ ...delivery, items: [{ productId: 1, quantity: 0, costCents: 100 }] }).error?.issues[0]?.message).toBe('Ingresá al menos 1');
  });

  it('rejects the same product twice in a delivery, pointing at the repeated line', () => {
    const repeated = purchaseInput.safeParse({
      paidAt: '2026-10-02',
      method: 'cash',
      items: [
        { productId: 1, quantity: 24, costCents: 1_200_000 },
        { productId: 1, quantity: 12, costCents: 600_000 },
      ],
    });
    expect(repeated.success).toBe(false);
    expect(repeated.error?.issues).toEqual([
      expect.objectContaining({ path: ['items', 1, 'productId'], message: 'Ese producto ya está en la entrega' }),
    ]);
  });
});
