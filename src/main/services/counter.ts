import type { DayMovement, DayMovements } from '../../shared/types';
import { type Context, today } from '../context';
import { listPaymentsOn } from '../repos/payments';
import { listCounterSales } from './counterSales';
import { listKioskSales } from './kiosk';

export function getDayMovements(ctx: Context): DayMovements {
  const date = today(ctx);
  const plans = listPaymentsOn(ctx.db, date);
  const tickets = listKioskSales(ctx, date).filter((sale) => !sale.voidedAt);
  const walkIns = listCounterSales(ctx, date).filter((sale) => !sale.voidedAt);
  const plansCents = plans.reduce((sum, p) => sum + p.amountCents, 0);
  const kioskCents = tickets.reduce((sum, s) => sum + s.totalCents, 0);
  const counterCents = walkIns.reduce((sum, s) => sum + s.priceCents, 0);
  const rows: DayMovement[] = [
    ...plans,
    ...tickets.map((sale) => ({ kind: 'kiosk' as const, sale })),
    ...walkIns.map((sale) => ({ kind: 'counter' as const, sale })),
  ];
  return { rows, kioskCents, plansCents, counterCents, totalCents: plansCents + kioskCents + counterCents };
}
