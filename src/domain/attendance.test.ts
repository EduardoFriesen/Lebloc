import { describe, expect, it } from 'vitest';
import { monthStart, todayStart } from './attendance';

describe('todayStart', () => {
  it('is local midnight', () => {
    expect(todayStart(new Date(2026, 9, 8, 18, 20, 0))).toEqual(new Date(2026, 9, 8, 0, 0, 0));
  });
});

describe('monthStart', () => {
  it('is the first day of the current local month as an ISO date', () => {
    expect(monthStart(new Date(2026, 9, 8, 18, 20))).toBe('2026-10-01');
    expect(monthStart(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });
});
