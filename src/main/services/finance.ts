import { balanceOf, type MoneySource, sumBySource } from '../../domain/finance';
import { bucketize, type DateRange, granularityFor, previousRange } from '../../domain/periods';
import type { FinanceSummary } from '../../shared/types';
import type { Context } from '../context';
import * as repo from '../repos/finance';

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
