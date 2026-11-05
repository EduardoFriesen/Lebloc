import { DomainError } from './errors';

export interface PaymentState {
  id: number;
  voidedAt: string | null;
}

/** What was cancelled is no longer owed, but it is not income either. */
export function saleDebt(totalCents: number, paidCents: number, cancelledCents: number): number {
  return totalCents - paidCents - cancelledCents;
}

/** Cancelling a debt forgives all of it, the teacher's part included. */
export function debtToCancel(sale: { voidedAt: string | null; debtCents: number }): number {
  if (sale.voidedAt) throw new DomainError('SALE_VOIDED');
  if (sale.debtCents <= 0) throw new DomainError('NO_DEBT_TO_CANCEL');
  return sale.debtCents;
}

export function assertPaymentVoidable(paymentId: number, salePayments: readonly PaymentState[]): void {
  const target = salePayments.find((payment) => payment.id === paymentId);
  if (!target) throw new DomainError('NOT_FOUND');
  if (target.voidedAt) throw new DomainError('ALREADY_VOIDED');
  // Allocations depend on earlier payments, so only the newest active one can go.
  const lastActiveId = Math.max(...salePayments.filter((payment) => !payment.voidedAt).map((payment) => payment.id));
  if (paymentId !== lastActiveId) throw new DomainError('ONLY_LAST_PAYMENT_VOIDABLE');
}

export function assertSaleVoidable(sale: { voidedAt: string | null; cancelledCents: number }, active: { payments: number; consumptions: number }): void {
  if (sale.voidedAt) throw new DomainError('ALREADY_VOIDED');
  if (active.payments > 0) throw new DomainError('SALE_HAS_ACTIVE_PAYMENTS');
  if (sale.cancelledCents > 0) throw new DomainError('SALE_HAS_ACTIVE_CANCELLATIONS');
  if (active.consumptions > 0) throw new DomainError('SALE_HAS_ACTIVE_CONSUMPTIONS');
}

export function teacherBalance(earnedCents: number, paidOutCents: number): number {
  return earnedCents - paidOutCents;
}

export function assertPayoutFits(balanceCents: number, amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new DomainError('INVALID_AMOUNT');
  if (amountCents > balanceCents) throw new DomainError('PAYOUT_EXCEEDS_BALANCE');
}

/**
 * A sale is invoiced once paid in full (a cancelled rest doesn't count), and only if a transfer came in: the cash
 * part is not invoiced.
 */
export function assertInvoiceable(
  sale: { voidedAt: string | null; totalCents: number; paidCents: number },
  payments: readonly { method: 'cash' | 'transfer'; voidedAt: string | null }[],
): void {
  if (sale.voidedAt) throw new DomainError('SALE_VOIDED');
  if (sale.paidCents < sale.totalCents) throw new DomainError('NOT_FULLY_PAID');
  if (!payments.some((payment) => payment.method === 'transfer' && !payment.voidedAt)) throw new DomainError('NOT_PAID_BY_TRANSFER');
}

/** What was invoiced must not change behind the mark: extending or voiding a payment needs it unticked first. */
export function assertNotInvoiced(sale: { invoicedAt: string | null }): void {
  if (sale.invoicedAt) throw new DomainError('SALE_INVOICED');
}
