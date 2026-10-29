import type { Dashboard } from '../../shared/types';
import { type Context, today } from '../context';
import { summaryCounts } from '../repos/saleStats';
import { getBackupStatus } from './backups';
import { listRenewals } from './clients';
import { listTeacherBalances } from './payouts';
import { listWaiverAlerts } from './waivers';

export function getDashboard(ctx: Context): Dashboard {
  const backup = getBackupStatus(ctx);
  return {
    summary: {
      ...summaryCounts(ctx.db, today(ctx)),
      pendingWaivers: listWaiverAlerts(ctx).length,
      teacherBalanceCents: listTeacherBalances(ctx).reduce((total, balance) => total + balance.balanceCents, 0),
      externalBackupFailed: backup.mirrorError !== null || backup.driveError !== null,
    },
    renewals: listRenewals(ctx),
  };
}
