import { describe, expect, it } from 'vitest';
import { expectDomainError } from '../test/helpers';
import {
  assertPurchaseEditable,
  assertPurchasePayable,
  assertPurchaseVoidable,
  purchaseDebtCents,
  purchaseTotalCents,
  suggestedPriceCents,
  ticketProfitCents,
  ticketTotalCents,
  unitCostCents,
} from './kiosk';

describe('unitCostCents', () => {
  it('divides the cost by the units bought', () => {
    expect(unitCostCents(1_200_000, 24)).toBe(50_000);
  });

  it('rounds to the nearest cent', () => {
    expect(unitCostCents(1_000, 3)).toBe(333);
    expect(unitCostCents(2_000, 3)).toBe(667);
  });
});

describe('suggestedPriceCents', () => {
  it('adds the markup over the unit cost', () => {
    expect(suggestedPriceCents(50_000, 60)).toBe(80_000);
  });

  it('is the unit cost when there is no markup', () => {
    expect(suggestedPriceCents(333, 0)).toBe(333);
  });

  it('rounds to the nearest cent', () => {
    expect(suggestedPriceCents(333, 60)).toBe(533); // 532.8
  });
});

describe('ticketTotalCents', () => {
  it('sums quantity times unit price', () => {
    expect(
      ticketTotalCents([
        { quantity: 2, unitPriceCents: 140_000 },
        { quantity: 1, unitPriceCents: 90_000 },
      ]),
    ).toBe(370_000);
  });

  it('is zero for no items', () => {
    expect(ticketTotalCents([])).toBe(0);
  });
});

describe('ticketProfitCents', () => {
  it('adds price minus unit cost for every unit sold', () => {
    expect(
      ticketProfitCents([
        { quantity: 2, unitPriceCents: 75_000, unitCostCents: 50_000 },
        { quantity: 1, unitPriceCents: 100_000, unitCostCents: 110_000 },
      ]),
    ).toBe(40_000);
  });
});

describe('purchaseTotalCents', () => {
  it('adds the cost of every line', () => {
    expect(purchaseTotalCents([{ costCents: 1_200_000 }, { costCents: 504_000 }])).toBe(1_704_000);
  });

  it('is zero for no lines', () => {
    expect(purchaseTotalCents([])).toBe(0);
  });
});

describe('supplier debt', () => {
  const voided = '2026-10-05T12:00:00.000Z';

  it('is the delivery total minus what was paid', () => {
    expect(purchaseDebtCents(1_200_000, 500_000)).toBe(700_000);
    expect(purchaseDebtCents(1_200_000, 1_200_000)).toBe(0);
  });

  it('takes payments up to what is owed', () => {
    expect(() => assertPurchasePayable({ voidedAt: null, debtCents: 700_000 }, 700_000)).not.toThrow();
    expectDomainError(() => assertPurchasePayable({ voidedAt: null, debtCents: 700_000 }, 0), 'INVALID_AMOUNT');
    expectDomainError(() => assertPurchasePayable({ voidedAt: null, debtCents: 700_000 }, 700_001), 'PAYMENT_EXCEEDS_DEBT');
    expectDomainError(() => assertPurchasePayable({ voidedAt: voided, debtCents: 700_000 }, 100), 'PURCHASE_VOIDED');
  });

  it('voids a delivery only without active payments, once', () => {
    expect(() => assertPurchaseVoidable({ voidedAt: null }, 0)).not.toThrow();
    expectDomainError(() => assertPurchaseVoidable({ voidedAt: null }, 1), 'PURCHASE_HAS_ACTIVE_PAYMENTS');
    expectDomainError(() => assertPurchaseVoidable({ voidedAt: voided }, 0), 'ALREADY_VOIDED');
  });

  it('edits a delivery as long as its new total covers what was paid', () => {
    expect(() => assertPurchaseEditable({ voidedAt: null, paidCents: 500_000 }, 500_000)).not.toThrow();
    expectDomainError(() => assertPurchaseEditable({ voidedAt: null, paidCents: 500_000 }, 499_999), 'PAID_EXCEEDS_PURCHASE');
    expectDomainError(() => assertPurchaseEditable({ voidedAt: voided, paidCents: 0 }, 100), 'PURCHASE_VOIDED');
  });
});
