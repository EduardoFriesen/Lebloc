import type { Dashboard } from '../../shared/types';
import { type Context, today } from '../context';
import { kioskDaySummary } from '../repos/kioskSales';
import { summaryCounts } from '../repos/saleStats';
import { getBackupStatus } from './backups';
import { listRenewals } from './clients';
import { listTeacherBalances } from './payouts';
import { listWaiverAlerts } from './waivers';

export function getDashboard(ctx: Context): Dashboard {
  const kiosk = kioskDaySummary(ctx.db, today(ctx));
  return {
    summary: {
      ...summaryCounts(ctx.db),
      pendingWaivers: listWaiverAlerts(ctx).length,
      teacherBalanceCents: listTeacherBalances(ctx).reduce((total, balance) => total + balance.balanceCents, 0),
      kioskTodayCount: kiosk.count,
      kioskTodayCents: kiosk.cents,
      externalBackupFailed: getBackupStatus(ctx).mirrorError !== null,
    },
    renewals: listRenewals(ctx),
  };
}
