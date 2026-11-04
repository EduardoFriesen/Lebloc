import { DomainError } from '../../domain/errors';
import { assertPurchasePayable, assertPurchaseVoidable, purchaseDebtCents, purchaseTotalCents, unitCostCents } from '../../domain/kiosk';
import type { PurchaseInput, PurchaseListInput, PurchasePaymentInput } from '../../shared/schemas';
import type { KioskPurchase, KioskPurchaseMonth } from '../../shared/types';
import { assertNotFuture, type Context, nowIso } from '../context';
import * as products from '../repos/products';
import * as repo from '../repos/purchases';

function toPurchase(ctx: Context, row: repo.PurchaseRow): KioskPurchase {
  const items = repo
    .listPurchaseItems(ctx.db, row.id)
    .map((item) => ({ ...item, unitCostCents: unitCostCents(item.costCents, item.quantity) }));
  const payments = repo.listPurchasePayments(ctx.db, row.id);
  const totalCents = purchaseTotalCents(items);
  const paidCents = payments.filter((payment) => !payment.voidedAt).reduce((total, payment) => total + payment.amountCents, 0);
  return { ...row, items, totalCents, payments, paidCents, debtCents: purchaseDebtCents(totalCents, paidCents) };
}

export function getPurchase(ctx: Context, id: number): KioskPurchase {
  const row = repo.findPurchase(ctx.db, id);
  if (!row) throw new DomainError('NOT_FOUND');
  return toPurchase(ctx, row);
}

function insertPayment(ctx: Context, purchase: KioskPurchase, payment: Omit<PurchasePaymentInput, 'purchaseId'>): void {
  assertNotFuture(ctx, payment.paidAt);
  assertPurchasePayable(purchase, payment.amountCents);
  repo.insertPurchasePayment(ctx.db, { purchaseId: purchase.id, ...payment, recordedAt: nowIso(ctx) });
}

/** Records what the supplier brought, and what was paid then; each product takes the unit cost of this delivery. */
export function createPurchase(ctx: Context, input: PurchaseInput): KioskPurchase {
  assertNotFuture(ctx, input.receivedAt);
  return ctx.db.transaction(() => {
    const id = repo.insertPurchase(ctx.db, { receivedAt: input.receivedAt, recordedAt: nowIso(ctx) });
    for (const { productId, quantity, costCents } of input.items) {
      const product = products.findProduct(ctx.db, productId);
      if (!product) throw new DomainError('NOT_FOUND');
      if (!product.active) throw new DomainError('PRODUCT_INACTIVE');
      repo.insertPurchaseItem(ctx.db, id, { productId, productName: product.name, quantity, costCents });
      products.setProductUnitCost(ctx.db, productId, unitCostCents(costCents, quantity));
    }
    if (input.initialPayment) insertPayment(ctx, getPurchase(ctx, id), input.initialPayment);
    return getPurchase(ctx, id);
  })();
}

export function payPurchase(ctx: Context, input: PurchasePaymentInput): KioskPurchase {
  return ctx.db.transaction(() => {
    const { purchaseId, ...payment } = input;
    insertPayment(ctx, getPurchase(ctx, purchaseId), payment);
    return getPurchase(ctx, purchaseId);
  })();
}

/** Any active payment can go: they don't depend on each other. */
export function voidPurchasePayment(ctx: Context, id: number): KioskPurchase {
  const payment = repo.findPurchasePayment(ctx.db, id);
  if (!payment) throw new DomainError('NOT_FOUND');
  if (payment.voidedAt) throw new DomainError('ALREADY_VOIDED');
  repo.voidPurchasePaymentRow(ctx.db, id, nowIso(ctx));
  return getPurchase(ctx, payment.purchaseId);
}

/** The product keeps the cost it has: it is fixed by hand if needed. */
export function voidPurchase(ctx: Context, id: number): KioskPurchase {
  const purchase = getPurchase(ctx, id);
  assertPurchaseVoidable(purchase, purchase.payments.filter((payment) => !payment.voidedAt).length);
  repo.voidPurchaseRow(ctx.db, id, nowIso(ctx));
  return getPurchase(ctx, id);
}

/** A month of deliveries, or every one still owed whatever its month; and what is owed to the supplier in all. */
export function getPurchaseMonth(ctx: Context, { month, onlyOwed }: PurchaseListInput): KioskPurchaseMonth {
  // ponytail: reads every active delivery to add up the debt; move it to SQL if they ever reach the thousands.
  const owed = repo
    .listActivePurchases(ctx.db)
    .map((row) => toPurchase(ctx, row))
    .filter((purchase) => purchase.debtCents > 0);
  const purchases = onlyOwed ? owed : repo.listPurchasesInMonth(ctx.db, month).map((row) => toPurchase(ctx, row));
  return {
    purchases,
    totalCents: purchases.filter((purchase) => !purchase.voidedAt).reduce((total, purchase) => total + purchase.totalCents, 0),
    owedCents: owed.reduce((total, purchase) => total + purchase.debtCents, 0),
  };
}
