import { DomainError } from './errors';

export interface PaymentState {
  id: number;
  voidedAt: string | null;
}

export function saleDebt(totalCents: number, paidCents: number): number {
  return totalCents - paidCents;
}

export function assertPaymentVoidable(paymentId: number, salePayments: readonly PaymentState[]): void {
  const target = salePayments.find((payment) => payment.id === paymentId);
  if (!target) throw new DomainError('NOT_FOUND');
  if (target.voidedAt) throw new DomainError('ALREADY_VOIDED');
  // Allocations depend on earlier payments, so only the newest active one can go.
  const lastActiveId = Math.max(...salePayments.filter((payment) => !payment.voidedAt).map((payment) => payment.id));
  if (paymentId !== lastActiveId) throw new DomainError('ONLY_LAST_PAYMENT_VOIDABLE');
}

export function assertSaleVoidable(sale: { voidedAt: string | null }, active: { payments: number; consumptions: number }): void {
  if (sale.voidedAt) throw new DomainError('ALREADY_VOIDED');
  if (active.payments > 0) throw new DomainError('SALE_HAS_ACTIVE_PAYMENTS');
  if (active.consumptions > 0) throw new DomainError('SALE_HAS_ACTIVE_CONSUMPTIONS');
}

export function teacherBalance(earnedCents: number, paidOutCents: number): number {
  return earnedCents - paidOutCents;
}

export function assertPayoutFits(balanceCents: number, amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new DomainError('INVALID_AMOUNT');
  if (amountCents > balanceCents) throw new DomainError('PAYOUT_EXCEEDS_BALANCE');
}
