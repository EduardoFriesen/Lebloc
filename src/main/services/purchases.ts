import { DomainError } from '../../domain/errors';
import { purchaseTotalCents, unitCostCents } from '../../domain/kiosk';
import type { PurchaseInput } from '../../shared/schemas';
import type { KioskPurchase, KioskPurchaseMonth } from '../../shared/types';
import { assertNotFuture, type Context, nowIso } from '../context';
import * as products from '../repos/products';
import * as repo from '../repos/purchases';

function toPurchase(ctx: Context, row: repo.PurchaseRow): KioskPurchase {
  const items = repo
    .listPurchaseItems(ctx.db, row.id)
    .map((item) => ({ ...item, unitCostCents: unitCostCents(item.costCents, item.quantity) }));
  return { ...row, items, totalCents: purchaseTotalCents(items) };
}

function getPurchase(ctx: Context, id: number): KioskPurchase {
  const row = repo.findPurchase(ctx.db, id);
  if (!row) throw new DomainError('NOT_FOUND');
  return toPurchase(ctx, row);
}

/** Records what the supplier brought and leaves each product with the unit cost of this delivery. */
export function createPurchase(ctx: Context, input: PurchaseInput): KioskPurchase {
  assertNotFuture(ctx, input.paidAt);
  return ctx.db.transaction(() => {
    const id = repo.insertPurchase(ctx.db, { paidAt: input.paidAt, method: input.method, recordedAt: nowIso(ctx) });
    for (const { productId, quantity, costCents } of input.items) {
      const product = products.findProduct(ctx.db, productId);
      if (!product) throw new DomainError('NOT_FOUND');
      if (!product.active) throw new DomainError('PRODUCT_INACTIVE');
      repo.insertPurchaseItem(ctx.db, id, { productId, productName: product.name, quantity, costCents });
      products.setProductUnitCost(ctx.db, productId, unitCostCents(costCents, quantity));
    }
    return getPurchase(ctx, id);
  })();
}

/** The product keeps the cost it has: it is fixed by hand if needed. */
export function voidPurchase(ctx: Context, id: number): KioskPurchase {
  if (getPurchase(ctx, id).voidedAt) throw new DomainError('ALREADY_VOIDED');
  repo.voidPurchaseRow(ctx.db, id, nowIso(ctx));
  return getPurchase(ctx, id);
}

export function getPurchaseMonth(ctx: Context, month: string): KioskPurchaseMonth {
  const purchases = repo.listPurchasesInMonth(ctx.db, month).map((row) => toPurchase(ctx, row));
  const live = purchases.filter((purchase) => !purchase.voidedAt);
  return { purchases, totalCents: live.reduce((total, purchase) => total + purchase.totalCents, 0) };
}
