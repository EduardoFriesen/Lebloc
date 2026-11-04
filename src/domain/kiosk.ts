import { DomainError } from './errors';

export function unitCostCents(costCents: number, quantity: number): number {
  return Math.round(costCents / quantity);
}

/** Markup over the unit cost. */
export function suggestedPriceCents(unitCostCents: number, markupPercent: number): number {
  return Math.round((unitCostCents * (100 + markupPercent)) / 100);
}

export function ticketTotalCents(items: readonly { quantity: number; unitPriceCents: number }[]): number {
  return items.reduce((total, item) => total + item.quantity * item.unitPriceCents, 0);
}

/** What the local keeps: price minus the unit cost snapshot, for every unit sold. */
export function ticketProfitCents(items: readonly { quantity: number; unitPriceCents: number; unitCostCents: number }[]): number {
  return items.reduce((total, item) => total + item.quantity * (item.unitPriceCents - item.unitCostCents), 0);
}

export function purchaseTotalCents(items: readonly { costCents: number }[]): number {
  return items.reduce((total, item) => total + item.costCents, 0);
}

/** What is still owed to the supplier for a delivery: never stored. */
export function purchaseDebtCents(totalCents: number, paidCents: number): number {
  return totalCents - paidCents;
}

export function assertPurchasePayable(purchase: { voidedAt: string | null; debtCents: number }, amountCents: number): void {
  if (purchase.voidedAt) throw new DomainError('PURCHASE_VOIDED');
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new DomainError('INVALID_AMOUNT');
  if (amountCents > purchase.debtCents) throw new DomainError('PAYMENT_EXCEEDS_DEBT');
}

/** Payments are voided first, so the delivery never takes paid money with it. */
export function assertPurchaseVoidable(purchase: { voidedAt: string | null }, activePayments: number): void {
  if (purchase.voidedAt) throw new DomainError('ALREADY_VOIDED');
  if (activePayments > 0) throw new DomainError('PURCHASE_HAS_ACTIVE_PAYMENTS');
}

export function assertPurchaseEditable(purchase: { voidedAt: string | null; paidCents: number }, newTotalCents: number): void {
  if (purchase.voidedAt) throw new DomainError('PURCHASE_VOIDED');
  if (newTotalCents < purchase.paidCents) throw new DomainError('PAID_EXCEEDS_PURCHASE');
}
