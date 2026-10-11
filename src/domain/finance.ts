export type MoneySource = 'plans' | 'teacher' | 'kiosk' | 'kiosk_cost' | 'day_pass' | 'shoe_rental' | 'expenses' | 'staff';
export type SourceTotals = Record<MoneySource, number>;

export interface Balance {
  incomeCents: number;
  expensesCents: number;
  resultCents: number;
}

export function emptyTotals(): SourceTotals {
  return { plans: 0, teacher: 0, kiosk: 0, kiosk_cost: 0, day_pass: 0, shoe_rental: 0, expenses: 0, staff: 0 };
}

export function sumBySource(rows: readonly { source: MoneySource; cents: number }[]): SourceTotals {
  const totals = emptyTotals();
  for (const row of rows) totals[row.source] += row.cents;
  return totals;
}

/**
 * What the local keeps. The teacher share of plan payments is passed on to the teacher, so it is never income;
 * kiosk stock is not an expense when bought but its cost is, sale by sale.
 */
export function balanceOf(totals: SourceTotals): Balance {
  const incomeCents = totals.plans + totals.kiosk + totals.day_pass + totals.shoe_rental;
  const expensesCents = totals.expenses + totals.staff + totals.kiosk_cost;
  return { incomeCents, expensesCents, resultCents: incomeCents - expensesCents };
}

export function marginPercent(balance: Balance): number | null {
  return balance.incomeCents === 0 ? null : Math.round((balance.resultCents / balance.incomeCents) * 100);
}
