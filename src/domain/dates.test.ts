import { describe, expect, it } from 'vitest';
import { daysBetween, parseIsoDate, toIsoDate } from './dates';

describe('dates', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(toIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('parses an ISO date and rejects malformed input', () => {
    expect(parseIsoDate('2026-10-05')).toEqual([2026, 10, 5]);
    expect(() => parseIsoDate('05/10/2026')).toThrow(RangeError);
  });

  it('counts calendar days between two dates', () => {
    expect(daysBetween('2026-09-30', '2026-10-05')).toBe(5);
    expect(daysBetween('2026-10-05', '2026-10-05')).toBe(0);
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
  });
});
