import { DomainError } from '../../domain/errors';
import { assertSaleVoidable } from '../../domain/ledger';
import { buildSaleSnapshot } from '../../domain/sale';
import type { SaleInput } from '../../shared/schemas';
import type { Sale } from '../../shared/types';
import { type Context, nowIso } from '../context';
import * as salesRepo from '../repos/sales';
import { requireActiveClient } from './clients';
import { registerPayment } from './payments';
import { getPlan } from './plans';
import { getTeacher } from './teachers';

export function getSale(ctx: Context, id: number): Sale {
  const sale = salesRepo.findSale(ctx.db, id);
  if (!sale) throw new DomainError('NOT_FOUND');
  return sale;
}

export function sellPlan(ctx: Context, input: SaleInput): Sale {
  return ctx.db.transaction(() => {
    requireActiveClient(ctx, input.clientId);
    const plan = getPlan(ctx, input.planId);
    const teacher = input.teacherId === null ? null : getTeacher(ctx, input.teacherId);
    const snapshot = buildSaleSnapshot(plan, teacher, input.splitRule);
    const saleId = salesRepo.insertSale(ctx.db, input.clientId, input.soldAt, snapshot);
    if (input.initialPayment) registerPayment(ctx, { saleId, ...input.initialPayment });
    return getSale(ctx, saleId);
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
