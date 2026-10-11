import { describe, expect, it } from 'vitest';
import { addDays, bucketize, bucketKey, bucketKeys, granularityFor, percentChange, presetRange, previousRange } from './periods';

describe('periods', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('builds the preset ranges from today', () => {
    const today = '2026-10-11';
    expect(presetRange('this_month', today)).toEqual({ from: '2026-10-01', to: '2026-10-11' });
    expect(presetRange('last_month', today)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(presetRange('last_3_months', today)).toEqual({ from: '2026-08-01', to: '2026-10-11' });
    expect(presetRange('last_12_months', today)).toEqual({ from: '2025-11-01', to: '2026-10-11' });
    expect(presetRange('this_year', today)).toEqual({ from: '2026-01-01', to: '2026-10-11' });
    expect(presetRange('last_month', '2026-03-15')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(presetRange('last_month', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('compares month-aligned ranges with the same months before', () => {
    expect(previousRange({ from: '2026-10-01', to: '2026-10-11' })).toEqual({ from: '2026-09-01', to: '2026-09-11' });
    expect(previousRange({ from: '2026-09-01', to: '2026-09-30' })).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(previousRange({ from: '2026-03-01', to: '2026-03-31' })).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(previousRange({ from: '2026-03-01', to: '2026-03-30' })).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(previousRange({ from: '2026-08-01', to: '2026-10-11' })).toEqual({ from: '2026-05-01', to: '2026-07-11' });
    expect(previousRange({ from: '2026-01-01', to: '2026-01-31' })).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('compares other ranges with the same number of days right before', () => {
    expect(previousRange({ from: '2026-10-05', to: '2026-10-11' })).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    expect(previousRange({ from: '2026-10-11', to: '2026-10-11' })).toEqual({ from: '2026-10-10', to: '2026-10-10' });
  });

  it('picks days, weeks or months by the length of the range', () => {
    expect(granularityFor({ from: '2026-10-01', to: '2026-10-31' })).toBe('day');
    expect(granularityFor({ from: '2026-10-01', to: '2026-11-01' })).toBe('week');
    expect(granularityFor({ from: '2026-04-01', to: '2026-10-03' })).toBe('week');
    expect(granularityFor({ from: '2025-11-01', to: '2026-10-11' })).toBe('month');
  });

  it('keys dates by day, Monday-starting week or month', () => {
    expect(bucketKey('2026-10-11', 'day')).toBe('2026-10-11');
    expect(bucketKey('2026-10-11', 'week')).toBe('2026-10-05'); // Sunday → the Monday before
    expect(bucketKey('2026-10-05', 'week')).toBe('2026-10-05');
    expect(bucketKey('2026-10-11', 'month')).toBe('2026-10');
    expect(bucketKeys({ from: '2026-09-29', to: '2026-10-02' }, 'day')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    expect(bucketKeys({ from: '2026-10-01', to: '2026-10-20' }, 'week')).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']);
    expect(bucketKeys({ from: '2025-12-15', to: '2026-02-01' }, 'month')).toEqual(['2025-12', '2026-01', '2026-02']);
  });

  it('sums daily rows into every bucket of the range, empty ones at zero', () => {
    const rows = [
      { date: '2026-10-01', cash: 100, count: 1 },
      { date: '2026-10-03', cash: 50, count: 2 },
      { date: '2026-10-07', cash: 10, count: 1 },
    ];
    expect(bucketize({ from: '2026-10-01', to: '2026-10-14' }, 'week', rows, ['cash', 'count'])).toEqual([
      { bucket: '2026-09-28', cash: 150, count: 3 },
      { bucket: '2026-10-05', cash: 10, count: 1 },
      { bucket: '2026-10-12', cash: 0, count: 0 },
    ]);
  });

  it('gives the change in percent, or null when there is nothing to compare with', () => {
    expect(percentChange(120, 100)).toBe(20);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(-50, -100)).toBe(50);
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });
});
