import { describe, expect, it } from 'vitest';
import type { Context } from './context';
import { openDatabase } from './db/connection';
import { seedDatabase } from './seed';
import { listClients } from './services/clients';
import { getDayEntries, getDayMovements } from './services/counter';
import { getDashboard } from './services/dashboard';
import { getStaffStats } from './services/employees';
import { getExpenseMonth } from './services/expenses';
import { listKioskSales } from './services/kiosk';
import { listPlans } from './services/plans';
import { listProducts } from './services/products';
import { listTeachers } from './services/teachers';
import { listWaiverAlerts } from './services/waivers';

describe('seedDatabase', () => {
  const now = new Date(2026, 9, 9, 12, 0, 0);
  const ctx: Context = { db: openDatabase(':memory:'), clock: { now: () => now } };
  seedDatabase(ctx.db, now);

  it('loads clients, teachers and plans, including archived and inactive ones', () => {
    const clients = listClients(ctx, { search: '', includeArchived: true, onlyDebtors: false, onlyWithPasses: false, onlyPendingWaiver: false });
    expect(clients).toHaveLength(200);
    expect(clients.some((client) => client.archivedAt !== null)).toBe(true);
    expect(clients.some((client) => client.activeSales === 0)).toBe(true);
    expect(listTeachers(ctx, true).some((teacher) => !teacher.active)).toBe(true);
    expect(listPlans(ctx, true).some((plan) => !plan.active)).toBe(true);
  });

  it('feeds every number of the counter summary and the renewals list', () => {
    const { summary, renewals } = getDashboard(ctx);
    expect(summary.activeClients).toBeGreaterThan(0);
    expect(summary.debtorCount).toBeGreaterThan(0);
    expect(summary.pendingWaivers).toBeGreaterThan(0);
    expect(summary.teacherBalanceCents).toBeGreaterThan(0);
    expect(renewals.length).toBeGreaterThan(0);
    expect(new Set(listWaiverAlerts(ctx).map((alert) => alert.state))).toEqual(new Set(['missing', 'expired']));
  });

  it('loads two months of expenses and employee shifts', () => {
    for (const month of ['2026-09', '2026-10']) {
      expect(getExpenseMonth(ctx, month).byCategory.map((row) => row.category)).toContain('rent');
      expect(getStaffStats(ctx, month).monthCostCents).toBeGreaterThan(0);
    }
    expect(getStaffStats(ctx, '2026-10')).toMatchObject({ active: 3, staff: 2, casual: 1 });
  });

  it('fills today entries with client passes and walk-in day passes', () => {
    const entries = getDayEntries(ctx);
    expect(entries.filter((entry) => entry.kind === 'pass').length).toBeGreaterThanOrEqual(5);
    expect(entries.filter((entry) => entry.kind === 'walk_in')).toHaveLength(2);
  });

  it('loads kiosk products and today sales that match the summary', () => {
    const products = listProducts(ctx, true);
    expect(products).toHaveLength(50);
    expect(products.some((product) => !product.active)).toBe(true);
    expect(products.some((product) => product.priceCents !== product.suggestedPriceCents)).toBe(true);
    const today = listKioskSales(ctx, '2026-10-09');
    const live = today.filter((sale) => !sale.voidedAt);
    const { summary } = getDashboard(ctx);
    expect(summary.kioskTodayCount).toBeGreaterThan(0);
    expect(summary.kioskTodayCents).toBeGreaterThan(0);
    expect(summary.kioskTodayCount).toBe(live.length);
    expect(summary.kioskTodayCents).toBe(live.reduce((total, sale) => total + sale.totalCents, 0));
    expect(
      ['2026-10-03', '2026-10-07'].flatMap((date) => listKioskSales(ctx, date)).some((sale) => sale.voidedAt !== null),
    ).toBe(true);
  });

  it('shows a plan payment, a kiosk ticket and walk-in passes in the counter movements of today', () => {
    const { rows, plansCents, kioskCents, counterCents, totalCents } = getDayMovements(ctx);
    const plan = rows.find((row) => row.kind === 'plan' && row.clientName.startsWith('Carla'));
    expect(plan).toMatchObject({ amountCents: 400_000, debtCents: 2_000_000 });
    expect(rows.some((row) => row.kind === 'kiosk')).toBe(true);
    expect(counterCents).toBe(1_900_000);
    expect(totalCents).toBe(plansCents + kioskCents + counterCents);
  });

  it('never writes movements in the future', () => {
    const todayIso = '2026-10-09';
    const latest = ctx.db
      .prepare(
        `SELECT MAX(d) AS d FROM (
           SELECT sold_at AS d FROM sales UNION ALL SELECT paid_at FROM payments
           UNION ALL SELECT substr(consumed_at, 1, 10) FROM consumptions UNION ALL SELECT signed_at FROM waiver_signatures
           UNION ALL SELECT sold_at FROM kiosk_sales UNION ALL SELECT sold_at FROM counter_sales)`,
      )
      .get() as { d: string };
    expect(latest.d <= todayIso).toBe(true);
  });

  it('has two months of kiosk tickets, plan sales and climbs to browse', () => {
    const count = (sql: string) => (ctx.db.prepare(sql).get() as { n: number }).n;
    expect(count('SELECT COUNT(*) AS n FROM kiosk_sales')).toBeGreaterThan(400);
    expect(count('SELECT COUNT(*) AS n FROM sales')).toBeGreaterThan(250);
    expect(count('SELECT COUNT(*) AS n FROM consumptions')).toBeGreaterThan(1000);
    expect(count('SELECT COUNT(*) AS n FROM counter_sales')).toBeGreaterThan(100);
  });
});
