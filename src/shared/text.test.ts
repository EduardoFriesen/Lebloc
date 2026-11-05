import { describe, expect, it } from 'vitest';
import { SHOWN_PRODUCTS, withMore } from './text';

describe('withMore', () => {
  it('names up to three and counts the rest', () => {
    expect(SHOWN_PRODUCTS).toBe(3);
    expect(withMore('1 × Agua, 2 × Barrita, 3 × Chicle', 5)).toBe('1 × Agua, 2 × Barrita, 3 × Chicle y 2 más');
    expect(withMore('1 × Agua, 2 × Barrita, 3 × Chicle', 4)).toBe('1 × Agua, 2 × Barrita, 3 × Chicle y 1 más');
  });

  it('leaves a short list as it is', () => {
    expect(withMore('1 × Agua, 2 × Barrita, 3 × Chicle', 3)).toBe('1 × Agua, 2 × Barrita, 3 × Chicle');
    expect(withMore('1 × Agua', 1)).toBe('1 × Agua');
  });
});
