import { beforeEach, describe, expect, it } from 'vitest';
import { expectDomainError } from '../../test/helpers';
import { createTestContext, type TestContext } from '../test-context';
import { getDashboard } from './dashboard';
import { listKioskSales, sellKiosk, voidKioskSale } from './kiosk';
import { createProduct, updateProduct } from './products';
import type { ProductInput } from '../../shared/schemas';

const alfajor: ProductInput = {
  name: 'Alfajor',
  packSize: 12,
  packCostCents: 600_000,
  markupPercent: 50,
  priceCents: 75_000,
  active: true,
};

describe('kiosk sales', () => {
  let ctx: TestContext;
  let alfajorId: number;
  let aguaId: number;

  beforeEach(() => {
    ctx = createTestContext();
    alfajorId = createProduct(ctx, alfajor).id;
    aguaId = createProduct(ctx, { ...alfajor, name: 'Agua', packSize: 6, packCostCents: 300_000, priceCents: 100_000 }).id;
  });

  const sell = () =>
    sellKiosk(ctx, {
      items: [
        { productId: alfajorId, quantity: 2 },
        { productId: aguaId, quantity: 1 },
      ],
      method: 'cash',
    });

  it('sells a ticket with server-side prices and snapshots', () => {
    const sale = sell();
    expect(sale).toMatchObject({ soldAt: '2026-10-05', method: 'cash', voidedAt: null, totalCents: 250_000 });
    expect(sale.items).toEqual([
      { id: expect.any(Number), productId: alfajorId, productName: 'Alfajor', quantity: 2, unitPriceCents: 75_000, unitCostCents: 50_000 },
      { id: expect.any(Number), productId: aguaId, productName: 'Agua', quantity: 1, unitPriceCents: 100_000, unitCostCents: 50_000 },
    ]);
  });

  it('keeps the sold prices when the product changes later', () => {
    const sale = sell();
    updateProduct(ctx, { ...alfajor, id: alfajorId, name: 'Alfajor triple', priceCents: 90_000 });
    expect(listKioskSales(ctx, '2026-10-05')).toEqual([sale]);
  });

  it('rejects inactive and unknown products without inserting anything', () => {
    updateProduct(ctx, { ...alfajor, id: aguaId, name: 'Agua', active: false });
    expectDomainError(() => sell(), 'PRODUCT_INACTIVE');
    expectDomainError(
      () => sellKiosk(ctx, { items: [{ productId: alfajorId, quantity: 1 }, { productId: 999, quantity: 1 }], method: 'cash' }),
      'NOT_FOUND',
    );
    expect(listKioskSales(ctx, '2026-10-05')).toEqual([]);
  });

  it('voids a ticket once', () => {
    const { id } = sell();
    expect(voidKioskSale(ctx, id).voidedAt).toBe(ctx.clock.now().toISOString());
    expectDomainError(() => voidKioskSale(ctx, id), 'ALREADY_VOIDED');
    expectDomainError(() => voidKioskSale(ctx, 999), 'NOT_FOUND');
  });

  it('lists the tickets of a date, voided included, newest first', () => {
    const first = sell();
    const second = sell();
    voidKioskSale(ctx, first.id);
    ctx.clock.set(new Date(2026, 9, 6, 12));
    sell();
    expect(listKioskSales(ctx, '2026-10-05').map((s) => s.id)).toEqual([second.id, first.id]);
    expect(listKioskSales(ctx, '2026-10-05')[1]?.voidedAt).not.toBeNull();
  });

  it('feeds the dashboard with today\'s non-voided tickets only', () => {
    const voided = sell();
    sell();
    voidKioskSale(ctx, voided.id);
    ctx.clock.set(new Date(2026, 9, 4, 12));
    sell();
    ctx.clock.set(new Date(2026, 9, 5, 12));
    expect(getDashboard(ctx).summary).toMatchObject({ kioskTodayCount: 1, kioskTodayCents: 250_000 });
  });
});
