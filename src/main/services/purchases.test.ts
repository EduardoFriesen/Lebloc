import { beforeEach, describe, expect, it } from 'vitest';
import type { PurchaseInput } from '../../shared/schemas';
import { expectDomainError } from '../../test/helpers';
import { createTestContext, type TestContext } from '../test-context';
import { listKioskSales, sellKiosk } from './kiosk';
import { createProduct, getProduct } from './products';
import { createPurchase, getPurchaseMonth, voidPurchase } from './purchases';

describe('supplier deliveries', () => {
  let ctx: TestContext;
  let agua: number;
  let barrita: number;
  const delivery = (paidAt: string, items: PurchaseInput['items'] = [{ productId: agua, quantity: 24, costCents: 1_200_000 }]): PurchaseInput => ({
    paidAt,
    method: 'cash',
    items,
  });

  beforeEach(() => {
    ctx = createTestContext(); // today: 2026-10-05
    const product = { description: null, markupPercent: 50, priceCents: 80_000, active: true };
    agua = createProduct(ctx, { ...product, name: 'Agua', unitCostCents: 45_000 }).id;
    barrita = createProduct(ctx, { ...product, name: 'Barrita', unitCostCents: 40_000 }).id;
  });

  it("creates a delivery and sets each product's unit cost", () => {
    const purchase = createPurchase(
      ctx,
      delivery('2026-10-02', [
        { productId: agua, quantity: 24, costCents: 1_200_000 },
        { productId: barrita, quantity: 12, costCents: 504_000 },
      ]),
    );
    expect(purchase).toEqual({
      id: expect.any(Number),
      paidAt: '2026-10-02',
      method: 'cash',
      recordedAt: ctx.clock.now().toISOString(),
      voidedAt: null,
      items: [
        { productId: agua, productName: 'Agua', quantity: 24, costCents: 1_200_000, unitCostCents: 50_000 },
        { productId: barrita, productName: 'Barrita', quantity: 12, costCents: 504_000, unitCostCents: 42_000 },
      ],
      totalCents: 1_704_000,
    });
    expect(getProduct(ctx, agua).unitCostCents).toBe(50_000);
    expect(getProduct(ctx, barrita).unitCostCents).toBe(42_000);
  });

  it('rejects future dates, unknown and inactive products, saving nothing', () => {
    const off = createProduct(ctx, { name: 'Viejo', description: null, unitCostCents: 1_000, markupPercent: 0, priceCents: 1_000, active: false }).id;
    const withAgua = (productId: number) => [
      { productId: agua, quantity: 24, costCents: 1_200_000 },
      { productId, quantity: 1, costCents: 100 },
    ];
    expectDomainError(() => createPurchase(ctx, delivery('2026-10-06')), 'DATE_IN_FUTURE');
    expectDomainError(() => createPurchase(ctx, delivery('2026-10-02', withAgua(999))), 'NOT_FOUND');
    expectDomainError(() => createPurchase(ctx, delivery('2026-10-02', withAgua(off))), 'PRODUCT_INACTIVE');
    expect(getPurchaseMonth(ctx, '2026-10').purchases).toEqual([]);
    expect(getProduct(ctx, agua).unitCostCents).toBe(45_000);
  });

  it('voids once and leaves the product cost alone', () => {
    const { id } = createPurchase(ctx, delivery('2026-10-02'));
    expect(voidPurchase(ctx, id).voidedAt).toBe(ctx.clock.now().toISOString());
    expect(getProduct(ctx, agua).unitCostCents).toBe(50_000);
    expectDomainError(() => voidPurchase(ctx, id), 'ALREADY_VOIDED');
    expectDomainError(() => voidPurchase(ctx, 999), 'NOT_FOUND');
  });

  it('lists a month newest first and totals without the voided', () => {
    createPurchase(ctx, delivery('2026-09-30'));
    createPurchase(ctx, delivery('2026-10-01'));
    createPurchase(ctx, delivery('2026-10-03', [{ productId: barrita, quantity: 10, costCents: 300_000 }]));
    voidPurchase(ctx, createPurchase(ctx, delivery('2026-10-04')).id);

    const month = getPurchaseMonth(ctx, '2026-10');
    expect(month.purchases.map((purchase) => purchase.paidAt)).toEqual(['2026-10-04', '2026-10-03', '2026-10-01']);
    expect(month.totalCents).toBe(1_500_000);
    expect(getPurchaseMonth(ctx, '2026-09').totalCents).toBe(1_200_000);
  });

  it('a ticket sold after a delivery snapshots the new cost', () => {
    sellKiosk(ctx, { items: [{ productId: agua, quantity: 1 }], method: 'cash' });
    createPurchase(ctx, delivery('2026-10-05'));
    sellKiosk(ctx, { items: [{ productId: agua, quantity: 1 }], method: 'cash' });
    const costs = listKioskSales(ctx, '2026-10-05').flatMap((sale) => sale.items.map((item) => item.unitCostCents));
    expect(costs.sort()).toEqual([45_000, 50_000]);
  });
});
