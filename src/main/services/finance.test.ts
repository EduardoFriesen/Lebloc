import { beforeEach, describe, expect, it } from 'vitest';
import { must } from '../../test/helpers';
import { adultClient, basicTeacher, createTestContext, FAR_EXPIRY, freePlan, mixedPlan, TEST_NOW, type TestContext } from '../test-context';
import { createClient } from './clients';
import { consume } from './consumptions';
import { sellCounter, updateCounterPrices } from './counterSales';
import { createEmployee, listEmployees, recordShift, settleShifts } from './employees';
import { createExpense, voidExpense } from './expenses';
import { getFinanceClients, getFinanceSales, getFinanceSummary, getFinanceTeachers, getFinanceTraffic } from './finance';
import { sellKiosk, voidKioskSale } from './kiosk';
import { registerPayment } from './payments';
import { registerPayout } from './payouts';
import { createPlan } from './plans';
import { createProduct } from './products';
import { sellPlan } from './sales';
import { createTeacher } from './teachers';

const OCTOBER = { from: '2026-10-01', to: '2026-10-05' };

/**
 * Today is Monday 2026-10-05 at 12:00.
 * - Beto (enrolled in August) buys a free plan on 09-02 without paying and climbs on 09-03 at 18:00.
 * - Ana (enrolled 10-01) buys a free plan on 09-20, pays half then and half on 10-02; on 10-03 she buys the mixed
 *   plan with Juan, fully paid ($20.000 local + $10.000 teacher), climbs free on 10-03 at 23:30 and with Juan on 10-04.
 * - Juan gets a $4.000 payout on 10-04; Leo is an inactive teacher with nothing.
 * - Today: a $3.000 kiosk ticket (cost $2.000), a voided one, and a day pass with shoes ($8.000 + $3.000).
 * - Expenses: rent $40.000 on 10-01 and a voided gas bill; one 4-hour shift at $5.000 on 10-04.
 */
function scenario(ctx: TestContext) {
  const anaId = createClient(ctx, adultClient).id;
  const betoId = createClient(ctx, { ...adultClient, firstName: 'Beto', enrolledAt: '2026-08-01' }).id;
  const teacherId = createTeacher(ctx, basicTeacher).id;
  createTeacher(ctx, { ...basicTeacher, firstName: 'Leo', active: false });
  const mixedId = createPlan(ctx, mixedPlan).id;
  const freeId = createPlan(ctx, freePlan).id;
  const sale = { teacherId: null, splitRule: 'proportional' as const, expiresAt: FAR_EXPIRY, initialPayment: null };

  sellPlan(ctx, { ...sale, clientId: betoId, planId: freeId, soldAt: '2026-09-02' });
  ctx.clock.set(new Date(2026, 8, 3, 18, 0));
  consume(ctx, { clientId: betoId, kind: 'free', note: null });
  // Back to today: the sales below are dated after September 3rd, and no sale can be dated after "now".
  ctx.clock.set(TEST_NOW);

  const september = sellPlan(ctx, {
    ...sale,
    clientId: anaId,
    planId: freeId,
    soldAt: '2026-09-20',
    expiresAt: FAR_EXPIRY,
    initialPayment: { amountCents: 1_000_000, method: 'cash', paidAt: '2026-09-20' },
  });
  registerPayment(ctx, { saleId: september.id, amountCents: 1_000_000, method: 'cash', paidAt: '2026-10-02' });
  sellPlan(ctx, {
    ...sale,
    clientId: anaId,
    planId: mixedId,
    teacherId,
    soldAt: '2026-10-03',
    expiresAt: FAR_EXPIRY,
    initialPayment: { amountCents: 3_000_000, method: 'transfer', paidAt: '2026-10-03' },
  });
  ctx.clock.set(new Date(2026, 9, 3, 23, 30));
  consume(ctx, { clientId: anaId, kind: 'free', note: null });
  ctx.clock.set(new Date(2026, 9, 4, 10, 15));
  consume(ctx, { clientId: anaId, kind: 'teacher', note: null });
  ctx.clock.set(TEST_NOW);
  registerPayout(ctx, { teacherId, amountCents: 400_000, method: 'cash', paidAt: '2026-10-04', note: null });

  const water = createProduct(ctx, { name: 'Agua', packSize: 6, packCostCents: 1_200_000, markupPercent: 50, priceCents: 300_000, active: true }).id;
  createProduct(ctx, { name: 'Barrita', packSize: 12, packCostCents: 1_200_000, markupPercent: 50, priceCents: 150_000, active: true });
  sellKiosk(ctx, { items: [{ productId: water, quantity: 1 }], method: 'cash' });
  voidKioskSale(ctx, sellKiosk(ctx, { items: [{ productId: water, quantity: 5 }], method: 'cash' }).id);
  updateCounterPrices(ctx, { dayPassCents: 800_000, shoeRentalCents: 300_000 });
  sellCounter(ctx, { kinds: ['day_pass', 'shoe_rental'], method: 'cash' });

  createExpense(ctx, { category: 'rent', description: null, amountCents: 4_000_000, method: 'transfer', paidAt: '2026-10-01' });
  voidExpense(ctx, createExpense(ctx, { category: 'gas', description: null, amountCents: 999_900, method: 'cash', paidAt: '2026-10-01' }).id);
  const employee = createEmployee(ctx, {
    firstName: 'Lucía',
    lastName: 'Paz',
    dni: null,
    phone: null,
    address: null,
    kind: 'staff',
    hourlyRateCents: 500_000,
    active: true,
  }).id;
  recordShift(ctx, { employeeId: employee, workedOn: '2026-10-04', minutes: 240, note: null });
}

describe('finance', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
    scenario(ctx);
  });

  describe('summary', () => {
    it('counts what was collected in the range, keeping the teacher share apart', () => {
      const summary = getFinanceSummary(ctx, OCTOBER);
      expect(summary.totals).toEqual({
        plans: 3_000_000, // $10.000 of the September plan's second half + $20.000 local of the mixed plan
        teacher: 1_000_000,
        kiosk: 300_000,
        kiosk_cost: 200_000,
        day_pass: 800_000,
        shoe_rental: 300_000,
        expenses: 4_000_000,
        staff: 2_000_000,
      });
      expect(summary.current).toEqual({ incomeCents: 4_400_000, expensesCents: 6_200_000, resultCents: -1_800_000 });
      expect(summary.expensesByCategory).toEqual([{ category: 'rent', cents: 4_000_000 }]);
    });

    it('splits by payment method, with salaries from the settlements paid that way and no kiosk stock', () => {
      const employeeId = must(listEmployees(ctx, false, '2026-10')[0]).id;
      settleShifts(ctx, { employeeId, ...OCTOBER, paidAt: '2026-10-05', method: 'cash' });

      const cash = getFinanceSummary(ctx, { ...OCTOBER, method: 'cash' });
      expect(cash.range).toEqual(OCTOBER);
      expect(cash.totals).toEqual({
        plans: 1_000_000,
        teacher: 0,
        kiosk: 300_000,
        kiosk_cost: 0,
        day_pass: 800_000,
        shoe_rental: 300_000,
        expenses: 0,
        staff: 2_000_000,
      });
      expect(cash.expensesByCategory).toEqual([]);
      expect(cash.series.find((point) => point.bucket === '2026-10-05')?.outflow).toBe(2_000_000);

      const transfer = getFinanceSummary(ctx, { ...OCTOBER, method: 'transfer' });
      expect(transfer.totals).toEqual({
        plans: 2_000_000,
        teacher: 1_000_000,
        kiosk: 0,
        kiosk_cost: 0,
        day_pass: 0,
        shoe_rental: 0,
        expenses: 4_000_000,
        staff: 0,
      });
      expect(transfer.expensesByCategory).toEqual([{ category: 'rent', cents: 4_000_000 }]);

      // The total keeps counting the shift when it was worked, not its settlement on top.
      expect(getFinanceSummary(ctx, OCTOBER).totals.staff).toBe(2_000_000);
    });

    it('compares a payment method with the same method the month before', () => {
      const month = { from: '2026-10-01', to: '2026-10-31' };
      expect(getFinanceSummary(ctx, { ...month, method: 'cash' }).before.incomeCents).toBe(1_000_000);
      expect(getFinanceSummary(ctx, { ...month, method: 'transfer' }).before.incomeCents).toBe(0);
    });

    it('compares with the same days of the month before', () => {
      const summary = getFinanceSummary(ctx, OCTOBER);
      expect(summary.previous).toEqual({ from: '2026-09-01', to: '2026-09-05' });
      expect(summary.before).toEqual({ incomeCents: 0, expensesCents: 0, resultCents: 0 });
      expect(getFinanceSummary(ctx, { from: '2026-09-01', to: '2026-09-30' }).current.incomeCents).toBe(1_000_000);
    });

    it('series every day of the range, with outflows together', () => {
      const { granularity, series } = getFinanceSummary(ctx, OCTOBER);
      expect(granularity).toBe('day');
      expect(series).toEqual([
        { bucket: '2026-10-01', plans: 0, kiosk: 0, day_pass: 0, shoe_rental: 0, outflow: 4_000_000 },
        { bucket: '2026-10-02', plans: 1_000_000, kiosk: 0, day_pass: 0, shoe_rental: 0, outflow: 0 },
        { bucket: '2026-10-03', plans: 2_000_000, kiosk: 0, day_pass: 0, shoe_rental: 0, outflow: 0 },
        { bucket: '2026-10-04', plans: 0, kiosk: 0, day_pass: 0, shoe_rental: 0, outflow: 2_000_000 },
        { bucket: '2026-10-05', plans: 0, kiosk: 300_000, day_pass: 800_000, shoe_rental: 300_000, outflow: 200_000 },
      ]);
    });

    it('includes both ends of the range and nothing outside', () => {
      expect(getFinanceSummary(ctx, { from: '2026-10-02', to: '2026-10-02' }).totals.plans).toBe(1_000_000);
      expect(getFinanceSummary(ctx, { from: '2026-10-06', to: '2026-10-31' }).current).toEqual({ incomeCents: 0, expensesCents: 0, resultCents: 0 });
    });
  });

  describe('sales', () => {
    it('ranks plans sold in the range by count, with their local price', () => {
      expect(getFinanceSales(ctx, OCTOBER).plans).toEqual([
        { planId: expect.any(Number), planName: 'Pack 4+4', withTeacher: true, count: 1, localCents: 2_000_000 },
      ]);
      expect(getFinanceSales(ctx, { from: '2026-09-01', to: '2026-10-05' }).plans.map(({ planName, count }) => [planName, count])).toEqual([
        ['Pack 8 libres', 2],
        ['Pack 4+4', 1],
      ]);
    });

    it('ranks products by units with revenue, cost and profit, and lists active products that did not sell', () => {
      const sales = getFinanceSales(ctx, OCTOBER);
      expect(sales.products).toEqual([
        { productId: expect.any(Number), name: 'Agua', active: true, units: 1, revenueCents: 300_000, costCents: 200_000, profitCents: 100_000 },
      ]);
      expect(sales.unsold.map((product) => product.name)).toEqual(['Barrita']);
      expect(sales.tickets).toBe(1);
      expect(sales.averageTicketCents).toBe(300_000);
    });

    it('counts walk-in day passes and shoe rentals', () => {
      expect(getFinanceSales(ctx, OCTOBER).walkIns).toEqual({ day_pass: { count: 1, cents: 800_000 }, shoe_rental: { count: 1, cents: 300_000 } });
      expect(getFinanceSales(ctx, { from: '2026-09-01', to: '2026-09-30' })).toMatchObject({
        walkIns: { day_pass: { count: 0, cents: 0 }, shoe_rental: { count: 0, cents: 0 } },
        tickets: 0,
        averageTicketCents: 0,
      });
    });
  });

  describe('traffic', () => {
    it('counts visits by weekday and local hour, by kind and over time', () => {
      const traffic = getFinanceTraffic(ctx, OCTOBER);
      expect(traffic.total).toBe(3);
      expect(traffic.byKind).toEqual({ free: 1, teacher: 1, day_pass: 1 });
      expect(traffic.heatmap[6]?.[23]).toBe(1); // Saturday 10-03, 23 h local time (already Sunday in UTC)
      expect(traffic.heatmap[0]?.[10]).toBe(1); // Sunday 10-04, 10 h
      expect(traffic.heatmap[1]?.[12]).toBe(1); // Monday 10-05, 12 h (the day pass)
      expect(traffic.byWeekday).toEqual([1, 1, 0, 0, 0, 0, 1]);
      expect(traffic.series.map((point) => point.visits)).toEqual([0, 0, 1, 1, 1]);
    });

    it('leaves the other months out', () => {
      expect(getFinanceTraffic(ctx, { from: '2026-09-01', to: '2026-09-30' })).toMatchObject({ total: 1, byKind: { free: 1, teacher: 0, day_pass: 0 } });
    });
  });

  describe('teachers', () => {
    it('shows classes given, students, what was collected and paid for each teacher, and the balance today', () => {
      expect(getFinanceTeachers(ctx, OCTOBER)).toEqual([
        {
          teacherId: expect.any(Number),
          name: 'Juan Pared',
          active: true,
          classes: 1,
          students: 1,
          earnedCents: 1_000_000,
          paidOutCents: 400_000,
          balanceCents: 600_000,
          pendingClasses: 3,
        },
      ]);
    });

    it('keeps active teachers without movement in the range', () => {
      expect(getFinanceTeachers(ctx, { from: '2026-09-01', to: '2026-09-30' })).toMatchObject([
        { name: 'Juan Pared', classes: 0, earnedCents: 0, paidOutCents: 0, balanceCents: 600_000 },
      ]);
    });
  });

  describe('clients', () => {
    it('splits purchases into first ones and renewals and counts new clients and visitors', () => {
      const clients = getFinanceClients(ctx, OCTOBER);
      expect(clients).toMatchObject({ newClients: 1, visitors: 1, firstPurchases: 0, renewals: 1 });
      expect(clients.series.find((point) => point.bucket === '2026-10-03')).toEqual({ bucket: '2026-10-03', first: 0, renewal: 1 });
      expect(getFinanceClients(ctx, { from: '2026-09-01', to: '2026-09-30' })).toMatchObject({ firstPurchases: 2, renewals: 0 });
    });

    it('lists who came in the period before but not in this one', () => {
      const clients = getFinanceClients(ctx, OCTOBER);
      expect(clients.previous).toEqual({ from: '2026-09-01', to: '2026-09-05' });
      expect(clients.lapsed).toEqual([{ clientId: expect.any(Number), name: 'Beto Roca', lastVisit: '2026-09-03' }]);
    });

    it('reports the debtors of today', () => {
      expect(getFinanceClients(ctx, OCTOBER)).toMatchObject({ debtorCount: 1, debtTotalCents: 2_000_000 });
    });
  });
});
