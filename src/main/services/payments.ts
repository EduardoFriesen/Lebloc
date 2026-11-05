import { allocatePayment } from '../../domain/allocation';
import { DomainError } from '../../domain/errors';
import { assertNotInvoiced, assertPaymentVoidable, debtToCancel } from '../../domain/ledger';
import type { DebtCancellationInput, PaymentInput } from '../../shared/schemas';
import type { DebtCancellation, Payment } from '../../shared/types';
import { assertNotFuture, type Context, nowIso, today } from '../context';
import * as paymentsRepo from '../repos/payments';
import * as salesRepo from '../repos/sales';

export function getPayment(ctx: Context, id: number): Payment {
  const payment = paymentsRepo.findPayment(ctx.db, id);
  if (!payment) throw new DomainError('NOT_FOUND');
  return payment;
}

export function registerPayment(ctx: Context, input: PaymentInput): Payment {
  return ctx.db.transaction(() => {
    assertNotFuture(ctx, input.paidAt);
    const sale = salesRepo.findSale(ctx.db, input.saleId, today(ctx));
    if (!sale) throw new DomainError('NOT_FOUND');
    if (sale.voidedAt) throw new DomainError('SALE_VOIDED');
    // Allocation checks the parts against what was paid; the debt also leaves out what was cancelled.
    if (input.amountCents > sale.debtCents) throw new DomainError('PAYMENT_EXCEEDS_DEBT');
    const allocated = paymentsRepo.activeAllocationTotals(ctx.db, sale.id);
    const allocation = allocatePayment({
      totalCents: sale.totalCents,
      surchargeCents: sale.teacherSurchargeCents,
      splitRule: sale.splitRule,
      allocatedLocalCents: allocated.localCents,
      allocatedTeacherCents: allocated.teacherCents,
      amountCents: input.amountCents,
    });
    const id = paymentsRepo.insertPayment(ctx.db, {
      saleId: sale.id,
      paidAt: input.paidAt,
      amountCents: input.amountCents,
      method: input.method,
      ...allocation,
      recordedAt: nowIso(ctx),
    });
    return getPayment(ctx, id);
  })();
}

export function voidPayment(ctx: Context, id: number): Payment {
  return ctx.db.transaction(() => {
    const payment = getPayment(ctx, id);
    assertPaymentVoidable(id, paymentsRepo.listPaymentsForSale(ctx.db, payment.saleId));
    const sale = salesRepo.findSale(ctx.db, payment.saleId, today(ctx));
    if (sale) assertNotInvoiced(sale);
    paymentsRepo.voidPayment(ctx.db, id, nowIso(ctx));
    return getPayment(ctx, id);
  })();
}

function getDebtCancellation(ctx: Context, id: number): DebtCancellation {
  const cancellation = paymentsRepo.findDebtCancellation(ctx.db, id);
  if (!cancellation) throw new DomainError('NOT_FOUND');
  return cancellation;
}

/** Forgives all the sale still owes: not income, and the teacher only keeps what was collected for them. */
export function cancelDebt(ctx: Context, input: DebtCancellationInput): DebtCancellation {
  return ctx.db.transaction(() => {
    const sale = salesRepo.findSale(ctx.db, input.saleId, today(ctx));
    if (!sale) throw new DomainError('NOT_FOUND');
    return getDebtCancellation(ctx, paymentsRepo.insertDebtCancellation(ctx.db, sale.id, debtToCancel(sale), nowIso(ctx)));
  })();
}

export function voidDebtCancellation(ctx: Context, id: number): DebtCancellation {
  return ctx.db.transaction(() => {
    if (getDebtCancellation(ctx, id).voidedAt) throw new DomainError('ALREADY_VOIDED');
    paymentsRepo.voidDebtCancellation(ctx.db, id, nowIso(ctx));
    return getDebtCancellation(ctx, id);
  })();
}
