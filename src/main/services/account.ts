import { passStatus } from '../../domain/passes';
import type { ClientAccount } from '../../shared/types';
import { type Context, today } from '../context';
import { listConsumptionsForClient } from '../repos/consumptions';
import { listPaymentsForClient } from '../repos/payments';
import { listSalesForClient } from '../repos/sales';
import { listWaiversForClient } from '../repos/waivers';
import { getClient } from './clients';
import { getSettings } from './settings';
import { waiverStatusResolver } from './waivers';

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function getClientAccount(ctx: Context, clientId: number): ClientAccount {
  const client = getClient(ctx, clientId);
  const now = today(ctx);
  const sales = listSalesForClient(ctx.db, clientId, now);
  const active = sales.filter((sale) => !sale.voidedAt);
  const remainingFree = sum(active.map((sale) => sale.remainingFree));
  const remainingTeacher = sum(active.map((sale) => sale.remainingTeacher));
  // ISO dates sort as text: the last expiry among sales with passes left.
  const expiresAt = active.filter((sale) => sale.remainingFree + sale.remainingTeacher > 0).map((sale) => sale.expiresAt).sort().at(-1) ?? null;
  const waivers = listWaiversForClient(ctx.db, clientId);
  const lastSignedAt = waivers.find((waiver) => !waiver.voidedAt)?.signedAt ?? null;
  return {
    client,
    sales,
    payments: listPaymentsForClient(ctx.db, clientId),
    consumptions: listConsumptionsForClient(ctx.db, clientId),
    remainingFree,
    remainingTeacher,
    debtCents: sum(active.map((sale) => sale.debtCents)),
    expiresAt,
    lowOnPasses: active.length > 0 && passStatus(remainingFree + remainingTeacher, expiresAt, now, getSettings(ctx)) !== 'ok',
    waivers,
    waiver: waiverStatusResolver(ctx)(lastSignedAt),
  };
}
