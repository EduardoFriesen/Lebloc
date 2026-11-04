import type { Dashboard } from '../../shared/types';
import { type Context, today } from '../context';
import { summaryCounts } from '../repos/saleStats';
import { getBackupStatus } from './backups';
import { listTodayDebtors } from './clients';
import { listTeacherBalances } from './payouts';
import { countMissingWaivers } from './waivers';

export function getDashboard(ctx: Context): Dashboard {
  const backup = getBackupStatus(ctx);
  return {
    summary: {
      ...summaryCounts(ctx.db, today(ctx)),
      pendingWaivers: countMissingWaivers(ctx),
      teacherBalanceCents: listTeacherBalances(ctx).reduce((total, balance) => total + balance.balanceCents, 0),
      externalBackupFailed: backup.mirrorError !== null || backup.driveError !== null,
    },
    todayDebtors: listTodayDebtors(ctx),
  };
}
