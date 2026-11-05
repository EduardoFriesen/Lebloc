import { parseIsoDate } from './dates';
import { DomainError } from './errors';

export const ADULT_AGE = 18;

export function ageFrom(birthDate: string, today: string): number {
  const [birthYear, birthMonth, birthDay] = parseIsoDate(birthDate);
  const [year, month, day] = parseIsoDate(today);
  const hadBirthday = month > birthMonth || (month === birthMonth && day >= birthDay);
  return year - birthYear - (hadBirthday ? 0 : 1);
}

export function isMinor(birthDate: string, today: string): boolean {
  return ageFrom(birthDate, today) < ADULT_AGE;
}

/**
 * Born after this date (as a plain string comparison) means minor, so SQL can apply `isMinor`.
 * It may name a day that doesn't exist (Feb 29 on a common year); the comparison still holds.
 */
export function minorBirthCutoff(today: string): string {
  const [year, month, day] = parseIsoDate(today);
  return `${year - ADULT_AGE}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function assertGuardianRule(birthDate: string, guardianCount: number, today: string): void {
  if (isMinor(birthDate, today) && guardianCount === 0) throw new DomainError('MINOR_REQUIRES_GUARDIAN');
}
