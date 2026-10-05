import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { removeAt, replaceAt, sum } from './arrays';
import { formatDate } from './format';
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

  it('formats ISO dates as dd/mm/yyyy', () => {
    expect(formatDate('2026-10-05')).toBe('05/10/2026');
  });
});
