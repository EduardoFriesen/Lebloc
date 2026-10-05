import { DomainError } from '../../domain/errors';
import { pickSaleForConsumption } from '../../domain/passes';
import type { ConsumptionInput } from '../../shared/schemas';
import type { Consumption } from '../../shared/types';
import { type Context, nowIso } from '../context';
import * as consumptionsRepo from '../repos/consumptions';
import { listSalesForClient } from '../repos/sales';
import { requireActiveClient } from './clients';

export function getConsumption(ctx: Context, id: number): Consumption {
  const consumption = consumptionsRepo.findConsumption(ctx.db, id);
  if (!consumption) throw new DomainError('NOT_FOUND');
  return consumption;
}

export function consume(ctx: Context, input: ConsumptionInput): Consumption {
  return ctx.db.transaction(() => {
    requireActiveClient(ctx, input.clientId);
    const availability = listSalesForClient(ctx.db, input.clientId)
      .filter((sale) => !sale.voidedAt)
      .map((sale) => ({
        saleId: sale.id,
        soldAt: sale.soldAt,
        remaining: { free: sale.remainingFree, teacher: sale.remainingTeacher },
      }));
    const saleId = pickSaleForConsumption(availability, input.kind);
    const id = consumptionsRepo.insertConsumption(ctx.db, {
      saleId,
      kind: input.kind,
      consumedAt: nowIso(ctx),
      note: input.note,
    });
    return getConsumption(ctx, id);
  })();
}

export function voidConsumption(ctx: Context, id: number): Consumption {
  const consumption = getConsumption(ctx, id);
  if (consumption.voidedAt) throw new DomainError('ALREADY_VOIDED');
  consumptionsRepo.voidConsumption(ctx.db, id, nowIso(ctx));
  return getConsumption(ctx, id);
}
