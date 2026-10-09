import { daysBetween } from '../../domain/dates';
import { isLowOnPasses } from '../../domain/passes';
import type { Dashboard, Debtor } from '../../shared/types';
import { type Context, today } from '../context';
import { listClientPassTotals, listDebtorRows } from '../repos/saleStats';
import { listTeacherBalances } from './payouts';
import { getSettings } from './settings';
import { listWaiverAlerts } from './waivers';

const DASHBOARD_DEBTORS = 10;

export function listDebtors(ctx: Context): Debtor[] {
  const now = today(ctx);
  return listDebtorRows(ctx.db).map((row) => ({ ...row, daysSinceSale: daysBetween(row.soldAt, now) }));
}

export function getDashboard(ctx: Context): Dashboard {
  const { lowPassesThreshold } = getSettings(ctx);
  return {
    lowPasses: listClientPassTotals(ctx.db).filter((client) =>
      isLowOnPasses(client.remainingFree + client.remainingTeacher, lowPassesThreshold),
    ),
    debtors: listDebtors(ctx).slice(0, DASHBOARD_DEBTORS),
    teacherBalances: listTeacherBalances(ctx).filter((balance) => balance.balanceCents !== 0),
    waiverAlerts: listWaiverAlerts(ctx),
  };
}
