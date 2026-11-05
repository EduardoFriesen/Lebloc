import { beforeEach, describe, expect, it } from 'vitest';
import { expectDomainError } from '../../test/helpers';
import type { ProductInput } from '../../shared/schemas';
import { setProductUnitCost } from '../repos/products';
import { createTestContext, type TestContext } from '../test-context';
import { sellKiosk, voidKioskSale } from './kiosk';
import { createProduct, getProduct, listProducts, listTopProducts, updateProduct } from './products';

const alfajor: ProductInput = {
  name: 'Alfajor',
  description: 'Triple',
  unitCostCents: 50_000,
  markupPercent: 50,
  priceCents: 75_000,
  active: true,
};

describe('products', () => {
  let ctx: TestContext;
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('creates a product with its unit cost, description and derived suggested price', () => {
    const product = createProduct(ctx, alfajor);
    expect(product).toMatchObject({
      name: 'Alfajor',
      description: 'Triple',
      priceCents: 75_000,
      active: true,
      unitCostCents: 50_000,
      suggestedPriceCents: 75_000,
    });
    expect(getProduct(ctx, product.id)).toEqual(product);
  });

  it('updates a product and recomputes the derived values', () => {
    const { id } = createProduct(ctx, alfajor);
    const updated = updateProduct(ctx, { ...alfajor, id, unitCostCents: 100_000, markupPercent: 0 });
    expect(updated).toMatchObject({ unitCostCents: 100_000, suggestedPriceCents: 100_000 });
  });

  it('takes a new unit cost from a delivery and recomputes the suggested price', () => {
    const { id } = createProduct(ctx, alfajor);
    setProductUnitCost(ctx.db, id, 40_000);
    expect(getProduct(ctx, id)).toMatchObject({ unitCostCents: 40_000, suggestedPriceCents: 60_000, priceCents: 75_000 });
  });

  it('rejects duplicate names regardless of case, but allows re-saving the same product', () => {
    const { id } = createProduct(ctx, alfajor);
    expectDomainError(() => createProduct(ctx, { ...alfajor, name: 'ALFAJOR' }), 'PRODUCT_NAME_TAKEN');
    const other = createProduct(ctx, { ...alfajor, name: 'Agua' });
    expectDomainError(() => updateProduct(ctx, { ...alfajor, id: other.id, name: 'alfajor' }), 'PRODUCT_NAME_TAKEN');
    expect(updateProduct(ctx, { ...alfajor, id, priceCents: 80_000 }).priceCents).toBe(80_000);
  });

  it('lists by name and hides inactive products unless asked', () => {
    createProduct(ctx, alfajor);
    createProduct(ctx, { ...alfajor, name: 'Agua', active: false });
    createProduct(ctx, { ...alfajor, name: 'Barra' });
    expect(listProducts(ctx, false).map((p) => p.name)).toEqual(['Alfajor', 'Barra']);
    expect(listProducts(ctx, true).map((p) => p.name)).toEqual(['Agua', 'Alfajor', 'Barra']);
  });

  it('fails with NOT_FOUND for unknown ids', () => {
    expectDomainError(() => getProduct(ctx, 99), 'NOT_FOUND');
    expectDomainError(() => updateProduct(ctx, { ...alfajor, id: 99 }), 'NOT_FOUND');
  });
});

describe('top products', () => {
  const make = (ctx: TestContext, name: string, active = true) =>
    createProduct(ctx, { name, description: null, unitCostCents: 1000, markupPercent: 50, priceCents: 1500, active }).id;

  it('ranks by units, skips voided/old/inactive, fills by name, max 5', () => {
    const ctx = createTestContext();
    const [beta, alfa, cola, dulce, , fanta] = ['Beta', 'Alfa', 'Cola', 'Dulce', 'Eter', 'Fanta'].map((n) => make(ctx, n)) as [number, number, number, number, number, number];
    const off = make(ctx, 'Zeta');
    const sell = (productId: number, quantity: number) => sellKiosk(ctx, { items: [{ productId, quantity }], method: 'cash' });
    sell(cola, 3);
    sell(beta, 1);
    sell(fanta, 5);
    voidKioskSale(ctx, sell(alfa, 9).id);
    sell(off, 20);
    updateProduct(ctx, { id: off, name: 'Zeta', description: null, unitCostCents: 1000, markupPercent: 50, priceCents: 1500, active: false });
    ctx.clock.set(new Date(2026, 8, 1, 12));
    sell(dulce, 50);
    ctx.clock.set(new Date(2026, 9, 5, 12));
    const names = listTopProducts(ctx).map((p) => p.name);
    expect(names).toEqual(['Fanta', 'Cola', 'Beta', 'Alfa', 'Dulce']);
  });
});
