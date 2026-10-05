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

export function assertGuardianRule(birthDate: string, guardianCount: number, today: string): void {
  if (isMinor(birthDate, today) && guardianCount === 0) throw new DomainError('MINOR_REQUIRES_GUARDIAN');
}
