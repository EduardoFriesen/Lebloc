import { addMonths } from '../../domain/dates';
import { DomainError } from '../../domain/errors';
import { suggestedPriceCents } from '../../domain/kiosk';
import type { ProductInput, ProductUpdate } from '../../shared/schemas';
import type { Product } from '../../shared/types';
import { type Context, today } from '../context';
import * as repo from '../repos/products';

function toProduct(row: repo.ProductRow): Product {
  return { ...row, suggestedPriceCents: suggestedPriceCents(row.unitCostCents, row.markupPercent) };
}

function assertNameFree(ctx: Context, name: string, ownId?: number): void {
  const existing = repo.findProductIdByName(ctx.db, name);
  if (existing !== undefined && existing !== ownId) throw new DomainError('PRODUCT_NAME_TAKEN');
}

export function listProducts(ctx: Context, includeInactive: boolean): Product[] {
  return repo.listProducts(ctx.db, includeInactive).map(toProduct);
}

export function getProduct(ctx: Context, id: number): Product {
  const row = repo.findProduct(ctx.db, id);
  if (!row) throw new DomainError('NOT_FOUND');
  return toProduct(row);
}

export function createProduct(ctx: Context, input: ProductInput): Product {
  return ctx.db.transaction(() => {
    assertNameFree(ctx, input.name);
    return getProduct(ctx, repo.insertProduct(ctx.db, input));
  })();
}

export function updateProduct(ctx: Context, { id, ...input }: ProductUpdate): Product {
  return ctx.db.transaction(() => {
    getProduct(ctx, id);
    assertNameFree(ctx, input.name, id);
    repo.updateProductRow(ctx.db, id, input);
    return getProduct(ctx, id);
  })();
}

export function listTopProducts(ctx: Context): Product[] {
  return repo.topProducts(ctx.db, addMonths(today(ctx), -1), 5).map(toProduct);
}
