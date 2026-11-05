import { DomainError } from '../../domain/errors';
import { assertPurchaseEditable, assertPurchasePayable, assertPurchaseVoidable, purchaseDebtCents, purchaseTotalCents, unitCostCents } from '../../domain/kiosk';
import type { PurchaseInput, PurchaseListInput, PurchasePaymentInput, PurchaseUpdate } from '../../shared/schemas';
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

/**
 * Saves the lines; `setsCost` says which products take the unit cost of their line. A product deactivated later can
 * stay in a delivery being fixed (`kept`), but not come in new.
 */
function insertItems(
  ctx: Context,
  purchaseId: number,
  items: PurchaseInput['items'],
  setsCost: (productId: number) => boolean,
  kept: ReadonlySet<number> = new Set(),
): void {
  for (const { productId, quantity, costCents } of items) {
    const product = products.findProduct(ctx.db, productId);
    if (!product) throw new DomainError('NOT_FOUND');
    if (!product.active && !kept.has(productId)) throw new DomainError('PRODUCT_INACTIVE');
    repo.insertPurchaseItem(ctx.db, purchaseId, { productId, productName: product.name, quantity, costCents });
    if (setsCost(productId)) products.setProductUnitCost(ctx.db, productId, unitCostCents(costCents, quantity));
  }
}

/** Records what the supplier brought, and what was paid then; each product takes the unit cost of this delivery. */
export function createPurchase(ctx: Context, input: PurchaseInput): KioskPurchase {
  assertNotFuture(ctx, input.receivedAt);
  return ctx.db.transaction(() => {
    const id = repo.insertPurchase(ctx.db, { receivedAt: input.receivedAt, recordedAt: nowIso(ctx) });
    insertItems(ctx, id, input.items, () => true);
    if (input.initialPayment) insertPayment(ctx, getPurchase(ctx, id), input.initialPayment);
    return getPurchase(ctx, id);
  })();
}

/**
 * Fixes the date or the lines. Payments stay, so the new total has to cover them. A product takes the new unit cost
 * only if this is still its latest delivery; one taken out keeps the cost it has.
 */
export function updatePurchase(ctx: Context, input: PurchaseUpdate): KioskPurchase {
  assertNotFuture(ctx, input.receivedAt);
  return ctx.db.transaction(() => {
    const purchase = getPurchase(ctx, input.id);
    assertPurchaseEditable(purchase, purchaseTotalCents(input.items));
    repo.updatePurchaseRow(ctx.db, input.id, input.receivedAt);
    repo.deletePurchaseItems(ctx.db, input.id);
    const kept = new Set(purchase.items.map((item) => item.productId));
    insertItems(ctx, input.id, input.items, (productId) => repo.latestActivePurchaseWith(ctx.db, productId) === input.id, kept);
    return getPurchase(ctx, input.id);
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
