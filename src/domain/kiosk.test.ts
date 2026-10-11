import { describe, expect, it } from 'vitest';
import { suggestedPriceCents, ticketProfitCents, ticketTotalCents, unitCostCents } from './kiosk';

describe('unitCostCents', () => {
  it('divides the pack cost by the units in the pack', () => {
    expect(unitCostCents(1_200_000, 12)).toBe(100_000);
  });

  it('rounds to the nearest cent', () => {
    expect(unitCostCents(1_000, 3)).toBe(333);
    expect(unitCostCents(2_000, 3)).toBe(667);
  });
});

describe('suggestedPriceCents', () => {
  it('adds the markup over the unit cost', () => {
    expect(suggestedPriceCents(1_200_000, 12, 40)).toBe(140_000);
  });

  it('is the unit cost when there is no markup', () => {
    expect(suggestedPriceCents(1_000, 3, 0)).toBe(333);
  });

  it('rounds once, from the pack values', () => {
    // 1000 / 3 * 11 = 3666.67 -> 3667; rounding the unit cost first would give 333 * 11 = 3663.
    expect(suggestedPriceCents(1_000, 3, 1_000)).toBe(3_667);
  });
});

describe('ticketTotalCents', () => {
  it('sums quantity times unit price', () => {
    expect(
      ticketTotalCents([
        { quantity: 2, unitPriceCents: 140_000 },
        { quantity: 1, unitPriceCents: 90_000 },
      ]),
    ).toBe(370_000);
  });

  it('is zero for no items', () => {
    expect(ticketTotalCents([])).toBe(0);
  });
});

describe('ticketProfitCents', () => {
  it('adds price minus unit cost for every unit sold', () => {
    expect(
      ticketProfitCents([
        { quantity: 2, unitPriceCents: 75_000, unitCostCents: 50_000 },
        { quantity: 1, unitPriceCents: 100_000, unitCostCents: 110_000 },
      ]),
    ).toBe(40_000);
  });
});
