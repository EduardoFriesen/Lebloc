import type { Dashboard } from '../../shared/types';
import type { Context } from '../context';
import { summaryCounts } from '../repos/saleStats';
import { listRenewals } from './clients';
import { listTeacherBalances } from './payouts';
import { listWaiverAlerts } from './waivers';

export function getDashboard(ctx: Context): Dashboard {
  return {
    summary: {
      ...summaryCounts(ctx.db),
      pendingWaivers: listWaiverAlerts(ctx).length,
      teacherBalanceCents: listTeacherBalances(ctx).reduce((total, balance) => total + balance.balanceCents, 0),
    },
    renewals: listRenewals(ctx),
  };
}
