import { describe, expect, it } from 'vitest';
import { hoursToMinutes, parseHoursInput, shiftCostCents } from './staff';

describe('staff rules', () => {
  it('turns hours into whole minutes', () => {
    expect(hoursToMinutes(4)).toBe(240);
    expect(hoursToMinutes(4.5)).toBe(270);
    expect(hoursToMinutes(0.33)).toBe(20);
  });

  it('prices a shift from minutes and the hourly rate, rounded to the cent', () => {
    expect(shiftCostCents(240, 500_000)).toBe(2_000_000);
    expect(shiftCostCents(270, 500_000)).toBe(2_250_000);
    expect(shiftCostCents(20, 100)).toBe(33);
    expect(shiftCostCents(60, 0)).toBe(0);
  });

  it('parses hours typed with comma or dot into minutes', () => {
    expect(parseHoursInput('4')).toBe(240);
    expect(parseHoursInput('4,5')).toBe(270);
    expect(parseHoursInput(' 7.25 ')).toBe(435);
    expect(parseHoursInput('')).toBeNull();
    expect(parseHoursInput('abc')).toBeNull();
    expect(parseHoursInput('-2')).toBeNull();
  });
});
