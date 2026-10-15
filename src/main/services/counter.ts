import { attendanceWindows } from '../../domain/attendance';
import { passStatus } from '../../domain/passes';
import type { DayEntry, DayMovement, DayMovements } from '../../shared/types';
import { type Context, today } from '../context';
import { listConsumptionsSince } from '../repos/consumptions';
import { listPaymentsOn } from '../repos/payments';
import { listCounterSales } from './counterSales';
import { listKioskSales } from './kiosk';
import { getSettings } from './settings';

/** ISO timestamps sort as text; payments without a time go last. */
function movementTime(movement: DayMovement): string {
  return (movement.kind === 'plan' ? movement.recordedAt : movement.sale.recordedAt) ?? '';
}

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
  ].sort((a, b) => movementTime(b).localeCompare(movementTime(a)));
  return { rows, kioskCents, plansCents, counterCents, totalCents: plansCents + kioskCents + counterCents };
}

/** Who came in today: client passes (with what they have left) and walk-in day passes, newest first. */
export function getDayEntries(ctx: Context): DayEntry[] {
  const { lowPassesThreshold } = getSettings(ctx);
  const passes = listConsumptionsSince(ctx.db, attendanceWindows(ctx.clock.now()).todayStart.toISOString()).map((row) => ({
    kind: 'pass' as const,
    ...row,
    passStatus: passStatus(row.remainingFree + row.remainingTeacher, lowPassesThreshold),
  }));
  const walkIns = listCounterSales(ctx, today(ctx))
    .filter((sale) => !sale.voidedAt && sale.kind === 'day_pass')
    .map((sale) => ({ kind: 'walk_in' as const, sale }));
  const time = (entry: DayEntry) => (entry.kind === 'pass' ? entry.recordedAt : entry.sale.recordedAt);
  return [...passes, ...walkIns].sort((a, b) => time(b).localeCompare(time(a)));
}
