import { daysBetween } from '../../domain/dates';
import type { Dashboard, Debtor } from '../../shared/types';
import { type Context, today } from '../context';
import { listDebtorRows, summaryCounts } from '../repos/saleStats';
import { listRenewals } from './clients';
import { listTeacherBalances } from './payouts';
import { listWaiverAlerts } from './waivers';

const DASHBOARD_DEBTORS = 10;

export function listDebtors(ctx: Context): Debtor[] {
  const now = today(ctx);
  return listDebtorRows(ctx.db).map((row) => ({ ...row, daysSinceSale: daysBetween(row.soldAt, now) }));
}

export function getDashboard(ctx: Context): Dashboard {
  const teacherBalances = listTeacherBalances(ctx);
  return {
    summary: {
      ...summaryCounts(ctx.db),
      teacherBalanceCents: teacherBalances.reduce((total, balance) => total + balance.balanceCents, 0),
    },
    renewals: listRenewals(ctx),
    debtors: listDebtors(ctx).slice(0, DASHBOARD_DEBTORS),
    teacherBalances: teacherBalances.filter((balance) => balance.balanceCents !== 0),
    waiverAlerts: listWaiverAlerts(ctx),
  };
}
