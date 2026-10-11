import { DomainError } from '../../domain/errors';
import { ticketTotalCents, unitCostCents } from '../../domain/kiosk';
import type { KioskSellInput } from '../../shared/schemas';
import type { KioskSale } from '../../shared/types';
import { type Context, nowIso, today } from '../context';
import * as repo from '../repos/kioskSales';
import * as products from '../repos/products';

function toSale(ctx: Context, row: repo.KioskSaleRow): KioskSale {
  const items = repo.listKioskItems(ctx.db, row.id);
  return { ...row, items, totalCents: ticketTotalCents(items) };
}

function getKioskSale(ctx: Context, id: number): KioskSale {
  const row = repo.findKioskSale(ctx.db, id);
  if (!row) throw new DomainError('NOT_FOUND');
  return toSale(ctx, row);
}

export function sellKiosk(ctx: Context, input: KioskSellInput): KioskSale {
  return ctx.db.transaction(() => {
    const lines = input.items.map(({ productId, quantity }) => {
      const product = products.findProduct(ctx.db, productId);
      if (!product) throw new DomainError('NOT_FOUND');
      if (!product.active) throw new DomainError('PRODUCT_INACTIVE');
      return {
        productId,
        productName: product.name,
        quantity,
        unitPriceCents: product.priceCents,
        unitCostCents: unitCostCents(product.packCostCents, product.packSize),
      };
    });
    const id = repo.insertKioskSale(ctx.db, { soldAt: today(ctx), recordedAt: nowIso(ctx), method: input.method });
    for (const line of lines) repo.insertKioskItem(ctx.db, id, line);
    return getKioskSale(ctx, id);
  })();
}

export function voidKioskSale(ctx: Context, id: number): KioskSale {
  if (getKioskSale(ctx, id).voidedAt) throw new DomainError('ALREADY_VOIDED');
  repo.voidKioskSale(ctx.db, id, nowIso(ctx));
  return getKioskSale(ctx, id);
}

export function listKioskSales(ctx: Context, date: string): KioskSale[] {
  return repo.listKioskSalesOn(ctx.db, date).map((row) => toSale(ctx, row));
}
