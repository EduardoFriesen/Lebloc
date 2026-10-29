import { beforeEach, describe, expect, it } from 'vitest';
import { adultClient, createTestContext, FAR_EXPIRY, freePlan, type TestContext } from '../test-context';
import { archiveClient, createClient } from './clients';
import { consume, voidConsumption } from './consumptions';
import { getDayEntries, getDayMovements } from './counter';
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
    saleId = sellPlan(ctx, { clientId, planId, teacherId: null, splitRule: 'proportional', soldAt: '2026-10-01', expiresAt: FAR_EXPIRY, initialPayment: null }).id;
    productId = createProduct(ctx, { name: 'Agua', description: null, unitCostCents: 50_000, markupPercent: 50, priceCents: 100_000, active: true }).id;
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

describe('counter day entries', () => {
  let ctx: TestContext;
  let clientId: number;

  beforeEach(() => {
    ctx = createTestContext();
    clientId = createClient(ctx, adultClient).id;
    const planId = createPlan(ctx, freePlan).id;
    sellPlan(ctx, { clientId, planId, teacherId: null, splitRule: 'proportional', soldAt: '2026-10-01', expiresAt: FAR_EXPIRY, initialPayment: null });
    updateCounterPrices(ctx, { dayPassCents: 800_000, shoeRentalCents: 300_000 });
  });

  const climbAt = (when: Date) => {
    ctx.clock.set(when);
    return consume(ctx, { clientId, kind: 'free', note: null });
  };

  it('is empty when nobody came today', () => {
    expect(getDayEntries(ctx)).toEqual([]);
  });

  it('lists today passes with what the client has left', () => {
    const first = climbAt(new Date(2026, 9, 5, 9));
    expect(getDayEntries(ctx)).toEqual([
      {
        kind: 'pass',
        consumptionId: first.id,
        clientId,
        clientName: 'Ana Roca',
        passKind: 'free',
        recordedAt: first.consumedAt,
        remainingFree: 7,
        remainingTeacher: 0,
        expiresAt: FAR_EXPIRY,
        passStatus: 'ok',
      },
    ]);
  });

  it('leaves out voided passes, other days, shoe rentals and voided walk-ins', () => {
    climbAt(new Date(2026, 9, 4, 23, 59));
    voidConsumption(ctx, climbAt(new Date(2026, 9, 5, 9)).id);
    sellCounter(ctx, { kinds: ['shoe_rental'], method: 'cash' });
    voidCounterSale(ctx, sellCounter(ctx, { kinds: ['day_pass'], method: 'cash' })[0]?.id ?? 0);
    expect(getDayEntries(ctx)).toEqual([]);
  });

  it('keeps the entry of a client archived after coming', () => {
    climbAt(new Date(2026, 9, 5, 9));
    archiveClient(ctx, clientId);
    expect(getDayEntries(ctx).map((entry) => entry.kind)).toEqual(['pass']);
  });

  it('mixes client passes and walk-in day passes, newest first', () => {
    ctx.clock.set(new Date(2026, 9, 5, 10));
    const [walkIn] = sellCounter(ctx, { kinds: ['day_pass', 'shoe_rental'], method: 'cash' });
    climbAt(new Date(2026, 9, 5, 9));
    const late = climbAt(new Date(2026, 9, 5, 11));
    expect(getDayEntries(ctx)).toMatchObject([
      { kind: 'pass', consumptionId: late.id, remainingFree: 6 },
      { kind: 'walk_in', sale: walkIn },
      { kind: 'pass' },
    ]);
  });
});
