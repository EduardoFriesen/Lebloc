import { describe, expect, it } from 'vitest';
import { balanceOf, emptyTotals, marginPercent, sumBySource } from './finance';

describe('finance rules', () => {
  it('leaves the teacher share out of income and counts kiosk stock as a cost', () => {
    const totals = sumBySource([
      { source: 'plans', cents: 1_000 },
      { source: 'teacher', cents: 400 },
      { source: 'kiosk', cents: 300 },
      { source: 'kiosk_cost', cents: 120 },
      { source: 'day_pass', cents: 80 },
      { source: 'shoe_rental', cents: 20 },
      { source: 'expenses', cents: 500 },
      { source: 'staff', cents: 200 },
      { source: 'plans', cents: 100 },
    ]);
    expect(totals.plans).toBe(1_100);
    expect(balanceOf(totals)).toEqual({ incomeCents: 1_500, expensesCents: 820, resultCents: 680 });
  });

  it('gives the margin over income, or null without income', () => {
    expect(marginPercent({ incomeCents: 1_500, expensesCents: 820, resultCents: 680 })).toBe(45);
    expect(marginPercent(balanceOf(emptyTotals()))).toBeNull();
  });
});
