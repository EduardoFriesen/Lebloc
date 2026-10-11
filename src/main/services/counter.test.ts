import { beforeEach, describe, expect, it } from 'vitest';
import { adultClient, createTestContext, freePlan, type TestContext } from '../test-context';
import { createClient } from './clients';
import { getDayMovements } from './counter';
import { sellCounter, updateCounterPrices, voidCounterSale } from './counterSales';
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
    expect(getDayMovements(ctx)).toEqual({ rows: [], kioskCents: 0, plansCents: 0, counterCents: 0, totalCents: 0 });
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
        recordedAt: ctx.clock.now().toISOString(),
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
    expect(getDayMovements(ctx)).toEqual({ rows: [], kioskCents: 0, plansCents: 0, counterCents: 0, totalCents: 0 });
  });

  it('lists walk-in passes and shoe rentals after the kiosk, leaving out voided ones', () => {
    updateCounterPrices(ctx, { dayPassCents: 800_000, shoeRentalCents: 300_000 });
    const [pass, shoes] = sellCounter(ctx, { kinds: ['day_pass', 'shoe_rental'], method: 'cash' });
    voidCounterSale(ctx, sellCounter(ctx, { kinds: ['day_pass'], method: 'cash' })[0]?.id ?? 0);
    const ticket = sell();
    const day = getDayMovements(ctx);
    expect(day.rows).toEqual([
      { kind: 'kiosk', sale: ticket },
      { kind: 'counter', sale: shoes },
      { kind: 'counter', sale: pass },
    ]);
    expect(day).toMatchObject({ kioskCents: 200_000, counterCents: 1_100_000, totalCents: 1_300_000 });
  });

  it('lists the movements of the day newest first, across kinds', () => {
    updateCounterPrices(ctx, { dayPassCents: 800_000, shoeRentalCents: 300_000 });
    ctx.clock.set(new Date(2026, 9, 5, 9));
    sell();
    ctx.clock.set(new Date(2026, 9, 5, 11));
    sellCounter(ctx, { kinds: ['day_pass'], method: 'cash' });
    ctx.clock.set(new Date(2026, 9, 5, 10));
    pay(100_000);
    expect(getDayMovements(ctx).rows.map((row) => row.kind)).toEqual(['counter', 'plan', 'kiosk']);
  });
});
