import { beforeEach, describe, expect, it } from 'vitest';
import { expectDomainError, must } from '../../test/helpers';
import { createTestContext, type TestContext } from '../test-context';
import { getCounterPrices, sellCounter, updateCounterPrices, voidCounterSale } from './counterSales';

describe('walk-in passes and shoe rental', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  it('starts with unset prices and stores the ones configured', () => {
    expect(getCounterPrices(ctx)).toEqual({ dayPassCents: 0, shoeRentalCents: 0 });
    expect(updateCounterPrices(ctx, { dayPassCents: 800_000, shoeRentalCents: 300_000 })).toEqual({ dayPassCents: 800_000, shoeRentalCents: 300_000 });
    expect(getCounterPrices(ctx)).toEqual({ dayPassCents: 800_000, shoeRentalCents: 300_000 });
  });

  it('sells a day pass with shoes at the configured prices, snapshotting them', () => {
    updateCounterPrices(ctx, { dayPassCents: 800_000, shoeRentalCents: 300_000 });
    const sold = sellCounter(ctx, { kinds: ['day_pass', 'shoe_rental'], method: 'transfer' });
    updateCounterPrices(ctx, { dayPassCents: 900_000, shoeRentalCents: 300_000 });
    expect(sold).toMatchObject([
      { kind: 'day_pass', priceCents: 800_000, method: 'transfer', soldAt: '2026-10-05', voidedAt: null },
      { kind: 'shoe_rental', priceCents: 300_000, method: 'transfer', soldAt: '2026-10-05', voidedAt: null },
    ]);
  });

  it('refuses to sell while a price is unset, without recording anything', () => {
    updateCounterPrices(ctx, { dayPassCents: 800_000, shoeRentalCents: 0 });
    expectDomainError(() => sellCounter(ctx, { kinds: ['day_pass', 'shoe_rental'], method: 'cash' }), 'PRICE_NOT_SET');
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM counter_sales').get()).toEqual({ n: 0 });
  });

  it('voids once', () => {
    updateCounterPrices(ctx, { dayPassCents: 800_000, shoeRentalCents: 300_000 });
    const sale = must(sellCounter(ctx, { kinds: ['shoe_rental'], method: 'cash' })[0]);
    expect(voidCounterSale(ctx, sale.id).voidedAt).not.toBeNull();
    expectDomainError(() => voidCounterSale(ctx, sale.id), 'ALREADY_VOIDED');
    expectDomainError(() => voidCounterSale(ctx, 999), 'NOT_FOUND');
  });
});
