import { isLowOnPasses } from '../../domain/passes';
import type { ClientAccount } from '../../shared/types';
import type { Context } from '../context';
import { listConsumptionsForClient } from '../repos/consumptions';
import { listPaymentsForClient } from '../repos/payments';
import { listSalesForClient } from '../repos/sales';
import { getClient } from './clients';
import { getSettings } from './settings';

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function getClientAccount(ctx: Context, clientId: number): ClientAccount {
  const client = getClient(ctx, clientId);
  const sales = listSalesForClient(ctx.db, clientId);
  const active = sales.filter((sale) => !sale.voidedAt);
  const remainingFree = sum(active.map((sale) => sale.remainingFree));
  const remainingTeacher = sum(active.map((sale) => sale.remainingTeacher));
  const { lowPassesThreshold } = getSettings(ctx);
  return {
    client,
    sales,
    payments: listPaymentsForClient(ctx.db, clientId),
    consumptions: listConsumptionsForClient(ctx.db, clientId),
    remainingFree,
    remainingTeacher,
    debtCents: sum(active.map((sale) => sale.debtCents)),
    lowOnPasses: active.length > 0 && isLowOnPasses(remainingFree + remainingTeacher, lowPassesThreshold),
  };
}
