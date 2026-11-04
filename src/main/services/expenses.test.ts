import { beforeEach, describe, expect, it } from 'vitest';
import type { ExpenseInput } from '../../shared/schemas';
import { expectDomainError } from '../../test/helpers';
import { createTestContext, type TestContext } from '../test-context';
import { createExpense, getExpenseMonth, setExpensePaid, voidExpense } from './expenses';
import { createProduct } from './products';
import { createPurchase, payPurchase, voidPurchasePayment } from './purchases';

const rent: ExpenseInput = { category: 'rent', description: 'Octubre', amountCents: 50_000_000, method: 'transfer', paidAt: '2026-10-01' };

describe('expenses', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext(); // today: 2026-10-05
  });

  it('records an expense with the time it was entered', () => {
    expect(createExpense(ctx, rent)).toEqual({
      id: expect.any(Number),
      ...rent,
      recordedAt: ctx.clock.now().toISOString(),
      markedPaidAt: null,
      voidedAt: null,
    });
  });

  it('marks an expense as paid and back, but not a voided one', () => {
    const { id } = createExpense(ctx, rent);
    expect(setExpensePaid(ctx, { id, paid: true }).markedPaidAt).toBe(ctx.clock.now().toISOString());
    expect(getExpenseMonth(ctx, '2026-10').expenses[0]?.markedPaidAt).toBe(ctx.clock.now().toISOString());
    expect(setExpensePaid(ctx, { id, paid: false }).markedPaidAt).toBeNull();
    voidExpense(ctx, id);
    expectDomainError(() => setExpensePaid(ctx, { id, paid: true }), 'ALREADY_VOIDED');
  });

  it('accepts today and rejects future dates', () => {
    expect(createExpense(ctx, { ...rent, paidAt: '2026-10-05' }).paidAt).toBe('2026-10-05');
    expectDomainError(() => createExpense(ctx, { ...rent, paidAt: '2026-10-06' }), 'DATE_IN_FUTURE');
  });

  it('voids an expense once', () => {
    const { id } = createExpense(ctx, rent);
    expect(voidExpense(ctx, id).voidedAt).toBe(ctx.clock.now().toISOString());
    expectDomainError(() => voidExpense(ctx, id), 'ALREADY_VOIDED');
    expectDomainError(() => voidExpense(ctx, 999), 'NOT_FOUND');
  });

  it('sums a month by category, largest first, listing voided ones without counting them', () => {
    createExpense(ctx, { ...rent, paidAt: '2026-09-30' });
    createExpense(ctx, rent);
    createExpense(ctx, { ...rent, category: 'electricity', amountCents: 3_000_000, paidAt: '2026-10-02' });
    createExpense(ctx, { ...rent, category: 'electricity', amountCents: 1_000_000, paidAt: '2026-10-03' });
    const voided = createExpense(ctx, { ...rent, category: 'gas', amountCents: 9_000_000, paidAt: '2026-10-04' });
    voidExpense(ctx, voided.id);

    const month = getExpenseMonth(ctx, '2026-10');
    expect(month.expenses.map((expense) => expense.paidAt)).toEqual(['2026-10-04', '2026-10-03', '2026-10-02', '2026-10-01']);
    expect(month.totalCents).toBe(54_000_000);
    expect(month.byCategory).toEqual([
      { category: 'rent', cents: 50_000_000 },
      { category: 'electricity', cents: 4_000_000 },
    ]);
    expect(getExpenseMonth(ctx, '2026-09').totalCents).toBe(50_000_000);
  });

  it('lists the supplier payments of the month and adds them to the total', () => {
    createExpense(ctx, rent);
    const agua = createProduct(ctx, { name: 'Agua', description: null, unitCostCents: 45_000, markupPercent: 50, priceCents: 80_000, active: true }).id;
    const { id } = createPurchase(ctx, {
      receivedAt: '2026-09-28',
      items: [{ productId: agua, quantity: 24, costCents: 2_000_000 }],
      initialPayment: { amountCents: 500_000, method: 'cash', paidAt: '2026-09-28' },
    });
    payPurchase(ctx, { purchaseId: id, amountCents: 1_200_000, method: 'transfer', paidAt: '2026-10-03' });
    // A voided one drops off.
    const voided = payPurchase(ctx, { purchaseId: id, amountCents: 100_000, method: 'cash', paidAt: '2026-10-04' }).payments.at(-1);
    voidPurchasePayment(ctx, voided?.id ?? -1);

    const month = getExpenseMonth(ctx, '2026-10');
    expect(month.supplierPayments).toEqual([
      { id: expect.any(Number), purchaseId: id, paidAt: '2026-10-03', method: 'transfer', amountCents: 1_200_000, receivedAt: '2026-09-28', productsLabel: '24 × Agua' },
    ]);
    expect(month.supplierCents).toBe(1_200_000);
    expect(month.totalCents).toBe(50_000_000 + 1_200_000);
    expect(month.byCategory).toEqual([{ category: 'rent', cents: 50_000_000 }]);
    expect(getExpenseMonth(ctx, '2026-09').supplierCents).toBe(500_000);
  });

  it('includes the 31st and leaves out the 1st of the next month', () => {
    ctx.clock.set(new Date(2026, 11, 15, 12));
    createExpense(ctx, { ...rent, paidAt: '2026-10-31' });
    createExpense(ctx, { ...rent, paidAt: '2026-11-01' });
    expect(getExpenseMonth(ctx, '2026-10').expenses).toHaveLength(1);
  });
});
