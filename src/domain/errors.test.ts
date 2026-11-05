import { describe, expect, it } from 'vitest';
import { DomainError, ERROR_MESSAGES } from './errors';

describe('DomainError', () => {
  it('carries a code and its Spanish message', () => {
    const error = new DomainError('PAYMENT_EXCEEDS_DEBT');
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('PAYMENT_EXCEEDS_DEBT');
    expect(error.message).toBe(ERROR_MESSAGES.PAYMENT_EXCEEDS_DEBT);
    expect(error.name).toBe('DomainError');
  });
});
