import { describe, expect, it } from 'vitest';
import { expectDomainError } from '../test/helpers';
import { ageFrom, assertGuardianRule, isMinor } from './client';

describe('ageFrom', () => {
  it('does not count the birthday until it happens', () => {
    expect(ageFrom('2008-10-06', '2026-10-05')).toBe(17);
    expect(ageFrom('2008-10-05', '2026-10-05')).toBe(18);
    expect(ageFrom('2008-11-01', '2026-10-05')).toBe(17);
  });

  it('handles leap-day birthdays', () => {
    expect(ageFrom('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageFrom('2008-02-29', '2026-03-01')).toBe(18);
  });
});

describe('isMinor', () => {
  it('is true below 18 and false from 18 on', () => {
    expect(isMinor('2008-10-06', '2026-10-05')).toBe(true);
    expect(isMinor('2008-10-05', '2026-10-05')).toBe(false);
  });
});

describe('assertGuardianRule', () => {
  it('requires at least one guardian for minors', () => {
    expectDomainError(() => assertGuardianRule('2015-01-01', 0, '2026-10-05'), 'MINOR_REQUIRES_GUARDIAN');
    expect(() => assertGuardianRule('2015-01-01', 1, '2026-10-05')).not.toThrow();
  });

  it('does not require guardians for adults', () => {
    expect(() => assertGuardianRule('1990-01-01', 0, '2026-10-05')).not.toThrow();
  });
});
