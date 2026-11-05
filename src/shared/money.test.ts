import { describe, expect, it } from 'vitest';
import { formatMoney, formatMoneyInput, parseMoneyInput } from './money';

describe('parseMoneyInput', () => {
  it('parses Argentine-formatted amounts into cents', () => {
    expect(parseMoneyInput('1500')).toBe(150_000);
    expect(parseMoneyInput('1.500')).toBe(150_000);
    expect(parseMoneyInput('1.500,50')).toBe(150_050);
    expect(parseMoneyInput('15000,5')).toBe(1_500_050);
    expect(parseMoneyInput(' $ 2.000 ')).toBe(200_000);
    expect(parseMoneyInput('0')).toBe(0);
  });

  it('rejects anything that is not an amount', () => {
    for (const text of ['', 'abc', '1,234', '1.50', '-100', '1.5000', '12,']) {
      expect(parseMoneyInput(text)).toBeNull();
    }
  });
});

describe('formatting', () => {
  it('formats cents as ARS currency', () => {
    expect(formatMoney(150_050)).toMatch(/\$\s1\.500,50/);
  });

  it('formats cents for an editable input that parses back to the same value', () => {
    expect(formatMoneyInput(2_000_000)).toBe('20.000,00');
    expect(parseMoneyInput(formatMoneyInput(123_456_789))).toBe(123_456_789);
  });
});
