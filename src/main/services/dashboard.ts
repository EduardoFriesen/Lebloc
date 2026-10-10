import { daysBetween } from '../../domain/dates';
import type { Dashboard, Debtor } from '../../shared/types';
import { type Context, today } from '../context';
import { listDebtorRows } from '../repos/saleStats';
import { listRenewals } from './clients';
import { listTeacherBalances } from './payouts';
import { listWaiverAlerts } from './waivers';

const DASHBOARD_DEBTORS = 10;

export function listDebtors(ctx: Context): Debtor[] {
  const now = today(ctx);
  return listDebtorRows(ctx.db).map((row) => ({ ...row, daysSinceSale: daysBetween(row.soldAt, now) }));
}

export function getDashboard(ctx: Context): Dashboard {
  return {
    renewals: listRenewals(ctx),
    debtors: listDebtors(ctx).slice(0, DASHBOARD_DEBTORS),
    teacherBalances: listTeacherBalances(ctx).filter((balance) => balance.balanceCents !== 0),
    waiverAlerts: listWaiverAlerts(ctx),
  };
}
