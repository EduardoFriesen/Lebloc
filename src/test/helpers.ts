import { expect } from 'vitest';
import { DomainError, type DomainErrorCode } from '../domain/errors';

export function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Expected a value');
  return value;
}

export function expectDomainError(fn: () => unknown, code: DomainErrorCode): void {
  try {
    fn();
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected DomainError ${code}, but nothing was thrown`);
}

export async function expectDomainErrorAsync(fn: () => Promise<unknown>, code: DomainErrorCode): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected DomainError ${code}, but nothing was thrown`);
}
