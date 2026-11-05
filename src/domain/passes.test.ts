import { describe, expect, it } from 'vitest';
import { expectDomainError } from '../test/helpers';
import { defaultExpiry, isExpired, isLowOnPasses, passStatus, pickSaleForConsumption, remainingPasses, totalPasses, type SaleAvailability } from './passes';

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

describe('pass expiry', () => {
  it('expires a month after the sale by default, on the last day when the month is shorter', () => {
    expect(defaultExpiry('2026-10-27')).toBe('2026-11-27');
    expect(defaultExpiry('2027-01-31')).toBe('2027-02-28');
  });

  it('can still be used on the expiry day', () => {
    expect(isExpired('2026-11-27', '2026-11-27')).toBe(false);
    expect(isExpired('2026-11-27', '2026-11-28')).toBe(true);
  });
});

describe('passStatus', () => {
  const today = '2026-10-27';
  const later = '2026-12-31';
  const warnings = { lowPassesThreshold: 2, expiryWarningDays: 7 };

  it('is none with zero passes, low up to the threshold and ok above it', () => {
    expect(passStatus(0, null, today, warnings)).toBe('none');
    expect(passStatus(1, later, today, warnings)).toBe('low');
    expect(passStatus(2, later, today, warnings)).toBe('low');
    expect(passStatus(3, later, today, warnings)).toBe('ok');
    expect(passStatus(1, later, today, { ...warnings, lowPassesThreshold: 0 })).toBe('ok');
  });

  it('is expiring when the passes left expire within the warning days, even if they are few', () => {
    expect(passStatus(8, '2026-11-03', today, warnings)).toBe('expiring');
    expect(passStatus(8, '2026-10-27', today, warnings)).toBe('expiring');
    expect(passStatus(1, '2026-11-03', today, warnings)).toBe('expiring');
    expect(passStatus(8, '2026-11-04', today, warnings)).toBe('ok');
    expect(passStatus(8, '2026-11-03', today, { ...warnings, expiryWarningDays: 0 })).toBe('ok');
  });
});
