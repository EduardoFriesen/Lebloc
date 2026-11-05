import { describe, expect, it } from 'vitest';
import { clampPage, pageCount } from './paging';

describe('paging', () => {
  it('counts pages, with at least one for an empty list', () => {
    expect(pageCount(0, 4)).toBe(1);
    expect(pageCount(4, 4)).toBe(1);
    expect(pageCount(5, 4)).toBe(2);
  });

  it('pulls the page back when the list shrinks under it', () => {
    expect(clampPage(1, 5, 4)).toBe(1);
    expect(clampPage(1, 4, 4)).toBe(0);
    expect(clampPage(3, 0, 4)).toBe(0);
  });
});
