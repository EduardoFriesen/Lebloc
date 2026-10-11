import { balanceOf, type MoneySource, sumBySource } from '../../domain/finance';
import { bucketize, type DateRange, granularityFor, previousRange } from '../../domain/periods';
import type { FinanceSales, FinanceSummary, FinanceTraffic, TeacherActivity } from '../../shared/types';
import type { Context } from '../context';
import * as repo from '../repos/finance';
import { listTeacherBalances } from './payouts';

const OUTFLOW = new Set<MoneySource>(['expenses', 'staff', 'kiosk_cost']);
const SERIES_FIELDS = ['plans', 'kiosk', 'day_pass', 'shoe_rental', 'outflow'] as const;

export function getFinanceSummary(ctx: Context, range: DateRange): FinanceSummary {
  const previous = previousRange(range);
  const granularity = granularityFor(range);
  const rows = repo.moneyByDay(ctx.db, range);
  const totals = sumBySource(rows);
  const daily = rows.map((row) => ({
    date: row.date,
    plans: row.source === 'plans' ? row.cents : 0,
    kiosk: row.source === 'kiosk' ? row.cents : 0,
    day_pass: row.source === 'day_pass' ? row.cents : 0,
    shoe_rental: row.source === 'shoe_rental' ? row.cents : 0,
    outflow: OUTFLOW.has(row.source) ? row.cents : 0,
  }));
  return {
    range,
    previous,
    granularity,
    current: balanceOf(totals),
    before: balanceOf(sumBySource(repo.moneyByDay(ctx.db, previous))),
    totals,
    expensesByCategory: repo.expensesByCategory(ctx.db, range),
    series: bucketize(range, granularity, daily, SERIES_FIELDS),
  };
}

export function getFinanceSales(ctx: Context, range: DateRange): FinanceSales {
  const products = repo.productSales(ctx.db, range).map((row) => ({ ...row, profitCents: row.revenueCents - row.costCents }));
  const walkIns: FinanceSales['walkIns'] = { day_pass: { count: 0, cents: 0 }, shoe_rental: { count: 0, cents: 0 } };
  for (const row of repo.walkInCounts(ctx.db, range)) walkIns[row.kind] = { count: row.count, cents: row.cents };
  const tickets = repo.ticketCount(ctx.db, range);
  const revenueCents = products.reduce((total, product) => total + product.revenueCents, 0);
  return {
    plans: repo.planRanking(ctx.db, range),
    walkIns,
    products: products.filter((product) => product.units > 0),
    unsold: products.filter((product) => product.active && product.units === 0).map(({ productId, name }) => ({ productId, name })),
    tickets,
    averageTicketCents: tickets === 0 ? 0 : Math.round(revenueCents / tickets),
  };
}

export function getFinanceTraffic(ctx: Context, range: DateRange): FinanceTraffic {
  const granularity = granularityFor(range);
  const rows = repo.visits(ctx.db, range);
  const heatmap = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const byKind: FinanceTraffic['byKind'] = { free: 0, teacher: 0, day_pass: 0 };
  for (const row of rows) {
    const day = heatmap[row.weekday];
    if (day) day[row.hour] = (day[row.hour] ?? 0) + row.visits;
    byKind[row.kind] += row.visits;
  }
  return {
    granularity,
    total: rows.reduce((total, row) => total + row.visits, 0),
    byKind,
    heatmap,
    byWeekday: heatmap.map((hours) => hours.reduce((total, count) => total + count, 0)),
    series: bucketize(range, granularity, rows, ['visits']).map(({ bucket, visits }) => ({ bucket, visits })),
  };
}

/** Every active teacher, plus inactive ones that still had movement or a balance. */
export function getFinanceTeachers(ctx: Context, range: DateRange): TeacherActivity[] {
  const balances = new Map(listTeacherBalances(ctx).map((balance) => [balance.teacherId, balance.balanceCents]));
  return repo
    .teacherActivity(ctx.db, range)
    .map((row) => ({ ...row, active: row.active === 1, balanceCents: balances.get(row.teacherId) ?? 0 }))
    .filter((row) => row.active || row.classes > 0 || row.earnedCents > 0 || row.paidOutCents > 0 || row.balanceCents !== 0);
}
