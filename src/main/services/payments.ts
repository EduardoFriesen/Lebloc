import { allocatePayment } from '../../domain/allocation';
import { DomainError } from '../../domain/errors';
import { assertPaymentVoidable } from '../../domain/ledger';
import type { PaymentInput } from '../../shared/schemas';
import type { Payment } from '../../shared/types';
import { type Context, nowIso } from '../context';
import * as paymentsRepo from '../repos/payments';
import * as salesRepo from '../repos/sales';

export function getPayment(ctx: Context, id: number): Payment {
  const payment = paymentsRepo.findPayment(ctx.db, id);
  if (!payment) throw new DomainError('NOT_FOUND');
  return payment;
}

export function registerPayment(ctx: Context, input: PaymentInput): Payment {
  return ctx.db.transaction(() => {
    const sale = salesRepo.findSale(ctx.db, input.saleId);
    if (!sale) throw new DomainError('NOT_FOUND');
    if (sale.voidedAt) throw new DomainError('SALE_VOIDED');
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
    });
    return getPayment(ctx, id);
  })();
}

export function voidPayment(ctx: Context, id: number): Payment {
  return ctx.db.transaction(() => {
    const payment = getPayment(ctx, id);
    assertPaymentVoidable(id, paymentsRepo.listPaymentsForSale(ctx.db, payment.saleId));
    paymentsRepo.voidPayment(ctx.db, id, nowIso(ctx));
    return getPayment(ctx, id);
  })();
}
