import { beforeEach, describe, expect, it } from 'vitest';
import { adultClient, createTestContext, freePlan, type TestContext } from '../test-context';
import { createClient } from './clients';
import { getDayMovements } from './counter';
import { sellKiosk, voidKioskSale } from './kiosk';
import { registerPayment, voidPayment } from './payments';
import { createPlan } from './plans';
import { createProduct } from './products';
import { sellPlan } from './sales';

describe('counter day movements', () => {
  let ctx: TestContext;
  let clientId: number;
  let saleId: number;
  let productId: number;

  beforeEach(() => {
    ctx = createTestContext();
    clientId = createClient(ctx, adultClient).id;
    const planId = createPlan(ctx, freePlan).id;
    saleId = sellPlan(ctx, { clientId, planId, teacherId: null, splitRule: 'proportional', soldAt: '2026-10-01', initialPayment: null }).id;
    productId = createProduct(ctx, { name: 'Agua', packSize: 6, packCostCents: 300_000, markupPercent: 50, priceCents: 100_000, active: true }).id;
  });

  const pay = (amountCents: number, paidAt = '2026-10-05') => registerPayment(ctx, { saleId, amountCents, method: 'cash', paidAt });
  const sell = () => sellKiosk(ctx, { items: [{ productId, quantity: 2 }], method: 'cash' });

  it('is empty without movements', () => {
    expect(getDayMovements(ctx)).toEqual({ rows: [], kioskCents: 0, plansCents: 0, totalCents: 0 });
  });

  it('lists today payments (with current debt) before kiosk tickets and totals them', () => {
    const payment = pay(500_000);
    const ticket = sell();
    const day = getDayMovements(ctx);
    expect(day.rows).toEqual([
      {
        kind: 'plan',
        paymentId: payment.id,
        clientId,
        clientName: 'Ana Roca',
        planName: 'Pack 8 libres',
        method: 'cash',
        amountCents: 500_000,
        saleTotalCents: 2_000_000,
        debtCents: 1_500_000,
      },
      { kind: 'kiosk', sale: ticket },
    ]);
    expect(day).toMatchObject({ kioskCents: 200_000, plansCents: 500_000, totalCents: 700_000 });
  });

  it('leaves out voided payments, voided tickets and other days', () => {
    voidPayment(ctx, pay(100_000).id);
    pay(100_000, '2026-10-04');
    voidKioskSale(ctx, sell().id);
    ctx.clock.set(new Date(2026, 9, 4, 12));
    sell();
    ctx.clock.set(new Date(2026, 9, 5, 12));
    expect(getDayMovements(ctx)).toEqual({ rows: [], kioskCents: 0, plansCents: 0, totalCents: 0 });
  });
});
