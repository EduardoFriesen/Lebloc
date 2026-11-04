import { beforeEach, describe, expect, it } from 'vitest';
import type { PurchaseInput } from '../../shared/schemas';
import { expectDomainError } from '../../test/helpers';
import { createTestContext, type TestContext } from '../test-context';
import { listKioskSales, sellKiosk } from './kiosk';
import { createProduct, getProduct } from './products';
import { createPurchase, getPurchase, getPurchaseMonth, payPurchase, voidPurchase, voidPurchasePayment } from './purchases';

describe('supplier deliveries', () => {
  let ctx: TestContext;
  let agua: number;
  let barrita: number;
  const paid = (amountCents: number, paidAt = '2026-10-05') => ({ amountCents, method: 'cash' as const, paidAt });
  const delivery = (
    receivedAt: string,
    items: PurchaseInput['items'] = [{ productId: agua, quantity: 24, costCents: 1_200_000 }],
    initialPayment: PurchaseInput['initialPayment'] = null,
  ): PurchaseInput => ({ receivedAt, items, initialPayment });
  const month = (value: string, onlyOwed = false) => getPurchaseMonth(ctx, { month: value, onlyOwed });

  beforeEach(() => {
    ctx = createTestContext(); // today: 2026-10-05
    const product = { description: null, markupPercent: 50, priceCents: 80_000, active: true };
    agua = createProduct(ctx, { ...product, name: 'Agua', unitCostCents: 45_000 }).id;
    barrita = createProduct(ctx, { ...product, name: 'Barrita', unitCostCents: 40_000 }).id;
  });

  it("creates a delivery paid in full and sets each product's unit cost", () => {
    const purchase = createPurchase(
      ctx,
      delivery(
        '2026-10-02',
        [
          { productId: agua, quantity: 24, costCents: 1_200_000 },
          { productId: barrita, quantity: 12, costCents: 504_000 },
        ],
        paid(1_704_000, '2026-10-02'),
      ),
    );
    expect(purchase).toEqual({
      id: expect.any(Number),
      receivedAt: '2026-10-02',
      recordedAt: ctx.clock.now().toISOString(),
      voidedAt: null,
      items: [
        { productId: agua, productName: 'Agua', quantity: 24, costCents: 1_200_000, unitCostCents: 50_000 },
        { productId: barrita, productName: 'Barrita', quantity: 12, costCents: 504_000, unitCostCents: 42_000 },
      ],
      totalCents: 1_704_000,
      payments: [{ id: expect.any(Number), purchaseId: purchase.id, paidAt: '2026-10-02', amountCents: 1_704_000, method: 'cash', voidedAt: null }],
      paidCents: 1_704_000,
      debtCents: 0,
    });
    expect(getProduct(ctx, agua).unitCostCents).toBe(50_000);
    expect(getProduct(ctx, barrita).unitCostCents).toBe(42_000);
  });

  it('creates a delivery paid in part or not at all', () => {
    expect(createPurchase(ctx, delivery('2026-10-02', undefined, paid(500_000)))).toMatchObject({ paidCents: 500_000, debtCents: 700_000 });
    expect(createPurchase(ctx, delivery('2026-10-02'))).toMatchObject({ payments: [], paidCents: 0, debtCents: 1_200_000 });
  });

  it('rejects future dates, unknown and inactive products, saving nothing', () => {
    const off = createProduct(ctx, { name: 'Viejo', description: null, unitCostCents: 1_000, markupPercent: 0, priceCents: 1_000, active: false }).id;
    const withAgua = (productId: number) => [
      { productId: agua, quantity: 24, costCents: 1_200_000 },
      { productId, quantity: 1, costCents: 100 },
    ];
    expectDomainError(() => createPurchase(ctx, delivery('2026-10-06')), 'DATE_IN_FUTURE');
    expectDomainError(() => createPurchase(ctx, delivery('2026-10-02', undefined, paid(100, '2026-10-06'))), 'DATE_IN_FUTURE');
    expectDomainError(() => createPurchase(ctx, delivery('2026-10-02', withAgua(999))), 'NOT_FOUND');
    expectDomainError(() => createPurchase(ctx, delivery('2026-10-02', withAgua(off))), 'PRODUCT_INACTIVE');
    expect(month('2026-10').purchases).toEqual([]);
    expect(getProduct(ctx, agua).unitCostCents).toBe(45_000);
  });

  it('rolls back a delivery whose first payment is too big', () => {
    expectDomainError(() => createPurchase(ctx, delivery('2026-10-02', undefined, paid(1_200_001))), 'PAYMENT_EXCEEDS_DEBT');
    expect(month('2026-10').purchases).toEqual([]);
    expect(getProduct(ctx, agua).unitCostCents).toBe(45_000);
  });

  it('pays the rest later and voids any payment, once', () => {
    const { id } = createPurchase(ctx, delivery('2026-10-02', undefined, paid(500_000)));
    const settled = payPurchase(ctx, { purchaseId: id, ...paid(700_000) });
    expect(settled).toMatchObject({ paidCents: 1_200_000, debtCents: 0 });
    const first = settled.payments.find((payment) => payment.amountCents === 500_000);
    expect(voidPurchasePayment(ctx, first?.id ?? -1)).toMatchObject({ paidCents: 700_000, debtCents: 500_000 });
    expectDomainError(() => voidPurchasePayment(ctx, first?.id ?? -1), 'ALREADY_VOIDED');
    expectDomainError(() => voidPurchasePayment(ctx, 999), 'NOT_FOUND');
    expectDomainError(() => payPurchase(ctx, { purchaseId: id, ...paid(500_001) }), 'PAYMENT_EXCEEDS_DEBT');
  });

  it('voids a delivery only without active payments, and leaves the product cost alone', () => {
    const { id } = createPurchase(ctx, delivery('2026-10-02', undefined, paid(500_000)));
    expectDomainError(() => voidPurchase(ctx, id), 'PURCHASE_HAS_ACTIVE_PAYMENTS');
    voidPurchasePayment(ctx, getPurchase(ctx, id).payments[0]?.id ?? -1);
    expect(voidPurchase(ctx, id).voidedAt).toBe(ctx.clock.now().toISOString());
    expect(getProduct(ctx, agua).unitCostCents).toBe(50_000);
    expectDomainError(() => voidPurchase(ctx, id), 'ALREADY_VOIDED');
    expectDomainError(() => voidPurchase(ctx, 999), 'NOT_FOUND');
    expectDomainError(() => payPurchase(ctx, { purchaseId: id, ...paid(100) }), 'PURCHASE_VOIDED');
  });

  it('a delivery that cost nothing owes nothing', () => {
    const free = createPurchase(ctx, delivery('2026-10-02', [{ productId: agua, quantity: 1, costCents: 0 }]));
    expect(free).toMatchObject({ totalCents: 0, debtCents: 0, payments: [] });
    expectDomainError(() => payPurchase(ctx, { purchaseId: free.id, ...paid(1) }), 'PAYMENT_EXCEEDS_DEBT');
  });

  it('lists a month newest first and totals without the voided', () => {
    createPurchase(ctx, delivery('2026-09-30'));
    createPurchase(ctx, delivery('2026-10-01'));
    createPurchase(ctx, delivery('2026-10-03', [{ productId: barrita, quantity: 10, costCents: 300_000 }]));
    voidPurchase(ctx, createPurchase(ctx, delivery('2026-10-04')).id);

    expect(month('2026-10').purchases.map((purchase) => purchase.receivedAt)).toEqual(['2026-10-04', '2026-10-03', '2026-10-01']);
    expect(month('2026-10').totalCents).toBe(1_500_000);
    expect(month('2026-09').totalCents).toBe(1_200_000);
  });

  it('shows what is owed from any month', () => {
    const september = createPurchase(ctx, delivery('2026-09-20')).id;
    const october = createPurchase(ctx, delivery('2026-10-02', undefined, paid(200_000))).id;
    createPurchase(ctx, delivery('2026-10-03', undefined, paid(1_200_000)));
    voidPurchase(ctx, createPurchase(ctx, delivery('2026-10-04')).id);

    expect(month('2026-10').purchases.map((purchase) => purchase.receivedAt)).toEqual(['2026-10-04', '2026-10-03', '2026-10-02']);
    expect(month('2026-10').owedCents).toBe(1_200_000 + 1_000_000);
    expect(month('2026-10', true).purchases.map((purchase) => purchase.id)).toEqual([october, september]);
  });

  it('a ticket sold after a delivery snapshots the new cost', () => {
    sellKiosk(ctx, { items: [{ productId: agua, quantity: 1 }], method: 'cash' });
    createPurchase(ctx, delivery('2026-10-05'));
    sellKiosk(ctx, { items: [{ productId: agua, quantity: 1 }], method: 'cash' });
    const costs = listKioskSales(ctx, '2026-10-05').flatMap((sale) => sale.items.map((item) => item.unitCostCents));
    expect(costs.sort()).toEqual([45_000, 50_000]);
  });
});
