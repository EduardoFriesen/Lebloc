import { monthStart } from '../../domain/attendance';
import { minorBirthCutoff } from '../../domain/client';
import type { ClientStats, PlanStats, TeacherStats } from '../../shared/types';
import { type Context, today } from '../context';
import { clientCounts } from '../repos/clients';
import { planCounts } from '../repos/plans';
import { monthSales, summaryCounts } from '../repos/saleStats';
import { teacherCounts } from '../repos/teachers';
import { listTeacherBalances } from './payouts';
import { listWaiverAlerts } from './waivers';

export function getClientStats(ctx: Context): ClientStats {
  const counts = clientCounts(ctx.db, { from: monthStart(ctx.clock.now()), bornAfter: minorBirthCutoff(today(ctx)) });
  const { activeClients, debtorCount, debtTotalCents } = summaryCounts(ctx.db, today(ctx));
  return {
    ...counts,
    withPasses: activeClients,
    withoutPasses: counts.active - activeClients,
    debtorCount,
    debtTotalCents,
    pendingWaivers: listWaiverAlerts(ctx).length,
  };
}

export function getTeacherStats(ctx: Context): TeacherStats {
  const balances = listTeacherBalances(ctx);
  const owed = balances.filter((balance) => balance.balanceCents > 0);
  return {
    ...teacherCounts(ctx.db),
    owedCents: owed.reduce((total, balance) => total + balance.balanceCents, 0),
    owedTeachers: owed.length,
    pendingClasses: balances.reduce((total, balance) => total + balance.pendingClasses, 0),
  };
}

export function getPlanStats(ctx: Context): PlanStats {
  return { ...planCounts(ctx.db), ...monthSales(ctx.db, monthStart(ctx.clock.now())) };
}
