import { describe, expect, it } from 'vitest';
import { matchesSearch } from './search';

describe('matchesSearch', () => {
  it('ignores case and accents on both sides', () => {
    expect(matchesSearch('Bebida isotónica', 'ISOTONICA')).toBe(true);
    expect(matchesSearch('Magnesio', 'magnésio')).toBe(true);
  });

  it('matches anywhere in the text and trims the query', () => {
    expect(matchesSearch('Barrita de cereal', '  cereal ')).toBe(true);
    expect(matchesSearch('Agua', 'alfajor')).toBe(false);
  });

  it('matches everything with an empty query', () => {
    expect(matchesSearch('Agua', '   ')).toBe(true);
  });
});
