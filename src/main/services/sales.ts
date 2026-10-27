import { DomainError } from '../../domain/errors';
import { assertSaleVoidable } from '../../domain/ledger';
import { buildSaleSnapshot } from '../../domain/sale';
import type { SaleExpiryInput, SaleInput } from '../../shared/schemas';
import type { Sale } from '../../shared/types';
import { assertNotFuture, type Context, nowIso, today } from '../context';
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

export function voidSale(ctx: Context, id: number): Sale {
  return ctx.db.transaction(() => {
    const sale = getSale(ctx, id);
    assertSaleVoidable(sale, salesRepo.countActiveMovements(ctx.db, id));
    salesRepo.voidSale(ctx.db, id, nowIso(ctx));
    return getSale(ctx, id);
  })();
}
