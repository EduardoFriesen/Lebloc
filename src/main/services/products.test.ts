import { beforeEach, describe, expect, it } from 'vitest';
import { expectDomainError } from '../../test/helpers';
import type { ProductInput } from '../../shared/schemas';
import { createTestContext, type TestContext } from '../test-context';
import { createProduct, getProduct, listProducts, updateProduct } from './products';

const alfajor: ProductInput = {
  name: 'Alfajor',
  packSize: 12,
  packCostCents: 600_000,
  markupPercent: 50,
  priceCents: 75_000,
  active: true,
};

describe('products', () => {
  let ctx: TestContext;
  beforeEach(() => {
    ctx = createTestContext();
  });

  it('creates a product with derived unit cost and suggested price', () => {
    const product = createProduct(ctx, alfajor);
    expect(product).toMatchObject({ name: 'Alfajor', priceCents: 75_000, active: true, unitCostCents: 50_000, suggestedPriceCents: 75_000 });
    expect(getProduct(ctx, product.id)).toEqual(product);
  });

  it('updates a product and recomputes the derived values', () => {
    const { id } = createProduct(ctx, alfajor);
    const updated = updateProduct(ctx, { ...alfajor, id, packCostCents: 1_200_000, markupPercent: 0 });
    expect(updated).toMatchObject({ unitCostCents: 100_000, suggestedPriceCents: 100_000 });
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
