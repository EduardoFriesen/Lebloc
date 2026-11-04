import { DomainError } from '../../domain/errors';
import { assertSaleVoidable } from '../../domain/ledger';
import { buildExtension, buildSaleSnapshot, extensionStateOf } from '../../domain/sale';
import type { SaleExpiryInput, SaleExtensionInput, SaleInput } from '../../shared/schemas';
import type { Sale } from '../../shared/types';
import { assertNotFuture, type Context, nowIso, today } from '../context';
import * as paymentsRepo from '../repos/payments';
import * as salesRepo from '../repos/sales';
import { requireActiveClient } from './clients';
import { registerPayment } from './payments';
import { getPlan } from './plans';
import { getTeacher } from './teachers';

export function getSale(ctx: Context, id: number): Sale {
  const sale = salesRepo.findSale(ctx.db, id, today(ctx));
  if (!sale) throw new DomainError('NOT_FOUND');
  return sale;
}

export function sellPlan(ctx: Context, input: SaleInput): Sale {
  return ctx.db.transaction(() => {
    assertNotFuture(ctx, input.soldAt);
    requireActiveClient(ctx, input.clientId);
    const plan = getPlan(ctx, input.planId);
    const teacher = input.teacherId === null ? null : getTeacher(ctx, input.teacherId);
    const snapshot = buildSaleSnapshot(plan, teacher, input.splitRule);
    const saleId = salesRepo.insertSale(ctx.db, input.clientId, { soldAt: input.soldAt, expiresAt: input.expiresAt }, snapshot);
    if (input.initialPayment) registerPayment(ctx, { saleId, ...input.initialPayment });
    return getSale(ctx, saleId);
  })();
}

/** Moves when the passes expire (a strike, a holiday, a typo): any day from the sale on, even after it expired. */
export function setSaleExpiry(ctx: Context, input: SaleExpiryInput): Sale {
  return ctx.db.transaction(() => {
    const sale = getSale(ctx, input.saleId);
    if (sale.voidedAt) throw new DomainError('SALE_VOIDED');
    requireActiveClient(ctx, sale.clientId);
    if (input.expiresAt < sale.soldAt) throw new DomainError('EXPIRY_BEFORE_SALE');
    salesRepo.updateExpiry(ctx.db, sale.id, input.expiresAt);
    return getSale(ctx, sale.id);
  })();
}

/**
 * The sale becomes another plan (a trial that turns into a pack): what was paid and the passes used count in the new
 * plan, the teacher stays, and what it was before is kept in sale_extensions.
 */
export function extendSale(ctx: Context, input: SaleExtensionInput): Sale {
  return ctx.db.transaction(() => {
    const sale = getSale(ctx, input.saleId);
    requireActiveClient(ctx, sale.clientId);
    const plan = getPlan(ctx, input.planId);
    const teacher = input.teacherId === null ? null : getTeacher(ctx, input.teacherId);
    const state = extensionStateOf(sale, paymentsRepo.listPaymentsForSale(ctx.db, sale.id));
    const snapshot = buildExtension(state, plan, teacher, input.splitRule);
    if (input.expiresAt < sale.soldAt) throw new DomainError('EXPIRY_BEFORE_SALE');
    salesRepo.insertExtension(ctx.db, sale, nowIso(ctx));
    salesRepo.applySnapshot(ctx.db, sale.id, snapshot, input.expiresAt);
    if (input.payment) registerPayment(ctx, { saleId: sale.id, ...input.payment });
    return getSale(ctx, sale.id);
  })();
}

export function voidSale(ctx: Context, id: number): Sale {
  return ctx.db.transaction(() => {
    const sale = getSale(ctx, id);
    assertSaleVoidable(sale, salesRepo.countActiveMovements(ctx.db, id));
    salesRepo.voidSale(ctx.db, id, nowIso(ctx));
    return getSale(ctx, id);
  })();
}
