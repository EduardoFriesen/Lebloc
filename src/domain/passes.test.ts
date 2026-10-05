import { describe, expect, it } from 'vitest';
import { expectDomainError } from '../test/helpers';
import { isLowOnPasses, pickSaleForConsumption, remainingPasses, totalPasses, type SaleAvailability } from './passes';

describe('remainingPasses', () => {
  it('subtracts used passes per kind', () => {
    expect(remainingPasses({ free: 4, teacher: 4 }, { free: 1, teacher: 3 })).toEqual({ free: 3, teacher: 1 });
    expect(totalPasses({ free: 3, teacher: 1 })).toBe(4);
  });
});

describe('isLowOnPasses', () => {
  it('is true at or below the threshold', () => {
    expect(isLowOnPasses(2, 2)).toBe(true);
    expect(isLowOnPasses(0, 2)).toBe(true);
    expect(isLowOnPasses(3, 2)).toBe(false);
  });
});

describe('pickSaleForConsumption', () => {
  const sales: SaleAvailability[] = [
    { saleId: 3, soldAt: '2026-09-10', remaining: { free: 2, teacher: 0 } },
    { saleId: 1, soldAt: '2026-08-01', remaining: { free: 0, teacher: 1 } },
    { saleId: 2, soldAt: '2026-09-10', remaining: { free: 5, teacher: 0 } },
  ];

  it('picks the oldest sale with passes of that kind (FIFO, then by id)', () => {
    expect(pickSaleForConsumption(sales, 'free')).toBe(2);
    expect(pickSaleForConsumption(sales, 'teacher')).toBe(1);
  });

  it('fails when no sale has passes of that kind', () => {
    expectDomainError(() => pickSaleForConsumption([{ saleId: 1, soldAt: '2026-08-01', remaining: { free: 0, teacher: 0 } }], 'free'), 'NO_PASSES_AVAILABLE');
    expectDomainError(() => pickSaleForConsumption([], 'teacher'), 'NO_PASSES_AVAILABLE');
  });
});
