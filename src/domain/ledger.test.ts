import { describe, expect, it } from 'vitest';
import { expectDomainError } from '../test/helpers';
import { assertPaymentVoidable, assertPayoutFits, assertSaleVoidable, saleDebt, teacherBalance } from './ledger';

describe('saleDebt', () => {
  it('is the total minus what was paid', () => {
    expect(saleDebt(3_000_000, 1_500_000)).toBe(1_500_000);
    expect(saleDebt(3_000_000, 3_000_000)).toBe(0);
  });
});

describe('assertPaymentVoidable', () => {
  const payments = [
    { id: 1, voidedAt: null },
    { id: 2, voidedAt: null },
    { id: 3, voidedAt: '2026-10-05T12:00:00.000Z' },
  ];

  it('allows voiding the last active payment', () => {
    expect(() => assertPaymentVoidable(2, payments)).not.toThrow();
  });

  it('rejects voiding a payment that is not the last active one', () => {
    expectDomainError(() => assertPaymentVoidable(1, payments), 'ONLY_LAST_PAYMENT_VOIDABLE');
  });

  it('rejects already voided and unknown payments', () => {
    expectDomainError(() => assertPaymentVoidable(3, payments), 'ALREADY_VOIDED');
    expectDomainError(() => assertPaymentVoidable(99, payments), 'NOT_FOUND');
  });
});

describe('assertSaleVoidable', () => {
  it('allows voiding a sale without active payments or consumptions', () => {
    expect(() => assertSaleVoidable({ voidedAt: null }, { payments: 0, consumptions: 0 })).not.toThrow();
  });

  it('rejects voided sales and sales with active movements', () => {
    expectDomainError(() => assertSaleVoidable({ voidedAt: '2026-10-05T12:00:00.000Z' }, { payments: 0, consumptions: 0 }), 'ALREADY_VOIDED');
    expectDomainError(() => assertSaleVoidable({ voidedAt: null }, { payments: 1, consumptions: 0 }), 'SALE_HAS_ACTIVE_PAYMENTS');
    expectDomainError(() => assertSaleVoidable({ voidedAt: null }, { payments: 0, consumptions: 2 }), 'SALE_HAS_ACTIVE_CONSUMPTIONS');
  });
});

describe('teacher balance and payouts', () => {
  it('balance is earned minus paid out and may be negative', () => {
    expect(teacherBalance(500_000, 200_000)).toBe(300_000);
    expect(teacherBalance(0, 200_000)).toBe(-200_000);
  });

  it('rejects payouts above the balance or not positive', () => {
    expect(() => assertPayoutFits(300_000, 300_000)).not.toThrow();
    expectDomainError(() => assertPayoutFits(300_000, 300_001), 'PAYOUT_EXCEEDS_BALANCE');
    expectDomainError(() => assertPayoutFits(-100, 1), 'PAYOUT_EXCEEDS_BALANCE');
    expectDomainError(() => assertPayoutFits(300_000, 0), 'INVALID_AMOUNT');
  });
});
