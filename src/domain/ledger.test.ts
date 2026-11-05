import { describe, expect, it } from 'vitest';
import { expectDomainError } from '../test/helpers';
import { assertInvoiceable, assertNotInvoiced, assertPaymentVoidable, assertPayoutFits, assertSaleVoidable, debtToCancel, saleDebt, teacherBalance } from './ledger';

describe('saleDebt', () => {
  it('is the total minus what was paid', () => {
    expect(saleDebt(3_000_000, 1_500_000, 0)).toBe(1_500_000);
    expect(saleDebt(3_000_000, 3_000_000, 0)).toBe(0);
  });

  it('leaves out what was cancelled', () => {
    expect(saleDebt(3_000_000, 1_000_000, 2_000_000)).toBe(0);
  });
});

describe('debtToCancel', () => {
  it('is everything the sale still owes', () => {
    expect(debtToCancel({ voidedAt: null, debtCents: 1_500_000 })).toBe(1_500_000);
  });

  it('rejects voided sales and sales that owe nothing', () => {
    expectDomainError(() => debtToCancel({ voidedAt: '2026-10-05T12:00:00.000Z', debtCents: 0 }), 'SALE_VOIDED');
    expectDomainError(() => debtToCancel({ voidedAt: null, debtCents: 0 }), 'NO_DEBT_TO_CANCEL');
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
    expect(() => assertSaleVoidable({ voidedAt: null, cancelledCents: 0 }, { payments: 0, consumptions: 0 })).not.toThrow();
  });

  it('rejects voided sales and sales with active movements', () => {
    expectDomainError(() => assertSaleVoidable({ voidedAt: '2026-10-05T12:00:00.000Z', cancelledCents: 0 }, { payments: 0, consumptions: 0 }), 'ALREADY_VOIDED');
    expectDomainError(() => assertSaleVoidable({ voidedAt: null, cancelledCents: 0 }, { payments: 1, consumptions: 0 }), 'SALE_HAS_ACTIVE_PAYMENTS');
    expectDomainError(() => assertSaleVoidable({ voidedAt: null, cancelledCents: 0 }, { payments: 0, consumptions: 2 }), 'SALE_HAS_ACTIVE_CONSUMPTIONS');
    expectDomainError(() => assertSaleVoidable({ voidedAt: null, cancelledCents: 500_000 }, { payments: 0, consumptions: 0 }), 'SALE_HAS_ACTIVE_CANCELLATIONS');
  });
});

describe('assertInvoiceable', () => {
  const voided = '2026-10-05T12:00:00.000Z';
  const paidUp = { voidedAt: null, totalCents: 1_000, paidCents: 1_000 };
  const transfer = { method: 'transfer' as const, voidedAt: null };

  it('allows invoicing a sale paid in full with at least one transfer', () => {
    expect(() => assertInvoiceable(paidUp, [{ method: 'cash', voidedAt: null }, transfer])).not.toThrow();
  });

  it('rejects a sale not paid in full, even if what is missing was cancelled', () => {
    expectDomainError(() => assertInvoiceable({ ...paidUp, paidCents: 400 }, [transfer]), 'NOT_FULLY_PAID');
  });

  it('rejects sales paid only in cash, with the transfer voided, or voided', () => {
    expectDomainError(() => assertInvoiceable(paidUp, [{ method: 'cash', voidedAt: null }]), 'NOT_PAID_BY_TRANSFER');
    expectDomainError(() => assertInvoiceable(paidUp, [{ method: 'transfer', voidedAt: voided }, { method: 'cash', voidedAt: null }]), 'NOT_PAID_BY_TRANSFER');
    expectDomainError(() => assertInvoiceable({ ...paidUp, voidedAt: voided }, [transfer]), 'SALE_VOIDED');
  });
});

describe('assertNotInvoiced', () => {
  it('lets the money of a sale change only while it is not invoiced', () => {
    expect(() => assertNotInvoiced({ invoicedAt: null })).not.toThrow();
    expectDomainError(() => assertNotInvoiced({ invoicedAt: '2026-10-05T12:00:00.000Z' }), 'SALE_INVOICED');
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
