import { describe, expect, it } from 'vitest';
import type { Context } from './context';
import { openDatabase } from './db/connection';
import { seedDatabase } from './seed';
import { listClients, listUsualAttendees } from './services/clients';
import { getDashboard } from './services/dashboard';
import { listPlans } from './services/plans';
import { listTeachers } from './services/teachers';
import { listWaiverAlerts } from './services/waivers';

describe('seedDatabase', () => {
  const now = new Date(2026, 9, 9, 12, 0, 0);
  const ctx: Context = { db: openDatabase(':memory:'), clock: { now: () => now } };
  seedDatabase(ctx.db, now);

  it('loads clients, teachers and plans, including archived and inactive ones', () => {
    const clients = listClients(ctx, { search: '', includeArchived: true, onlyDebtors: false, onlyWithPasses: false, onlyPendingWaiver: false });
    expect(clients.length).toBeGreaterThanOrEqual(20);
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

  it('preloads the counter with people who came last week at this time', () => {
    expect(listUsualAttendees(ctx).length).toBeGreaterThanOrEqual(5);
  });

  it('never writes movements in the future', () => {
    const todayIso = '2026-10-09';
    const latest = ctx.db
      .prepare(
        `SELECT MAX(d) AS d FROM (
           SELECT sold_at AS d FROM sales UNION ALL SELECT paid_at FROM payments
           UNION ALL SELECT substr(consumed_at, 1, 10) FROM consumptions UNION ALL SELECT signed_at FROM waiver_signatures)`,
      )
      .get() as { d: string };
    expect(latest.d <= todayIso).toBe(true);
  });
});
