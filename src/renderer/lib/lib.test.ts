import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { removeAt, replaceAt, sum } from './arrays';
import { archiveMessage, bucketLabel, debtLabel, formatCompactMoney, formatDate, formatHours, formatPercentChange, localMonth } from './format';
import { toFieldErrors } from './formErrors';

describe('renderer helpers', () => {
  it('maps zod issues to dotted field paths, keeping the first message per field', () => {
    const schema = z.object({
      name: z.string().min(1, 'Obligatorio'),
      items: z.array(z.object({ end: z.string().min(2, 'Corto') })),
    });
    const result = schema.safeParse({ name: '', items: [{ end: 'a' }] });
    expect(result.success).toBe(false);
    if (!result.success) expect(toFieldErrors(result.error)).toEqual({ name: 'Obligatorio', 'items.0.end': 'Corto' });
  });

  it('replaces, removes and sums immutably', () => {
    const items = ['a', 'b', 'c'];
    expect(replaceAt(items, 1, 'x')).toEqual(['a', 'x', 'c']);
    expect(removeAt(items, 0)).toEqual(['b', 'c']);
    expect(items).toEqual(['a', 'b', 'c']);
    expect(sum([100, 250, 50])).toBe(400);
  });

  it('formats minutes as hours with comma decimals', () => {
    expect(formatHours(270)).toBe('4,5 h');
    expect(formatHours(60)).toBe('1 h');
    expect(formatHours(20)).toBe('0,33 h');
  });

  it('labels chart buckets by day, week or month', () => {
    expect(bucketLabel('2026-10-05', 'day')).toBe('05/10');
    expect(bucketLabel('2026-10-05', 'week')).toBe('sem. 05/10');
    expect(bucketLabel('2026-10', 'month')).toBe('oct 2026');
  });

  it('formats axis money compactly and changes with sign', () => {
    expect(formatCompactMoney(45_000_000)).toBe('$ 450 mil');
    expect(formatCompactMoney(120_000_000)).toBe('$ 1,2 M');
    expect(formatCompactMoney(0)).toBe('$ 0');
    expect(formatPercentChange(20)).toBe('+20 %');
    expect(formatPercentChange(-5)).toBe('−5 %');
    expect(formatPercentChange(0)).toBe('0 %');
    expect(formatPercentChange(null)).toBe('—');
  });

  it('formats ISO dates as dd/mm/yyyy', () => {
    expect(formatDate('2026-10-05')).toBe('05/10/2026');
  });

  it('labels a debt with how long ago the oldest unpaid sale was', () => {
    expect(debtLabel({ debtCents: 1_500_000, debtDays: 40 })).toMatch(/^Debe \$\s15\.000,00 · hace 40 días$/);
    expect(debtLabel({ debtCents: 100, debtDays: 1 })).toMatch(/· hace 1 día$/);
    expect(debtLabel({ debtCents: 100, debtDays: 0 })).toMatch(/· desde hoy$/);
    expect(debtLabel({ debtCents: 100, debtDays: null })).toMatch(/^Debe \$\s1,00$/);
  });

  it('warns before archiving a client who owes or still has passes', () => {
    expect(archiveMessage({ debtCents: 0, remainingFree: 0, remainingTeacher: 0 })).not.toMatch(/Debe|Le queda/);
    expect(archiveMessage({ debtCents: 1_500_000, remainingFree: 0, remainingTeacher: 0 })).toMatch(/Debe \$\s15\.000,00: deja de figurar en Deudores/);
    expect(archiveMessage({ debtCents: 0, remainingFree: 2, remainingTeacher: 1 })).toMatch(/Le quedan 3 pases/);
    expect(archiveMessage({ debtCents: 0, remainingFree: 1, remainingTeacher: 0 })).toMatch(/Le queda 1 pase\./);
  });

  it('takes the month of a UTC timestamp in local time', () => {
    expect(localMonth(new Date(2026, 9, 31, 23, 30).toISOString())).toBe('2026-10');
    expect(localMonth(new Date(2026, 10, 1, 0, 5).toISOString())).toBe('2026-11');
  });
});
