import { ageFrom } from '../../domain/client';
import { toIsoDate } from '../../domain/dates';
import type { PassKind } from '../../domain/passes';
import type { Granularity } from '../../domain/periods';
import type { SplitRule } from '../../domain/sale';
import type { CounterSaleKind, EmployeeKind, ExpenseCategory, PaymentMethod, WaiverStatus } from '../../shared/types';

import { formatMoney } from '../../shared/money';

export { formatMoney, formatMoneyInput } from '../../shared/money';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { cash: 'Efectivo', transfer: 'Transferencia' };
export const COUNTER_SALE_LABELS: Record<CounterSaleKind, string> = { day_pass: 'Pase del día', shoe_rental: 'Pédulas' };
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent: 'Alquiler',
  electricity: 'Luz',
  gas: 'Gas',
  water: 'Agua',
  internet: 'Internet',
  taxes: 'Impuestos',
  maintenance: 'Mantenimiento',
  other: 'Otros',
};
export const EMPLOYEE_KIND_LABELS: Record<EmployeeKind, string> = { staff: 'Estable', casual: 'Ocasional' };

/** Worked minutes as hours: 270 → "4,5 h". */
export function formatHours(minutes: number): string {
  return `${(minutes / 60).toLocaleString('es-AR', { maximumFractionDigits: 2 })} h`;
}

/** Local HH:MM of an ISO timestamp, e.g. the time a ticket was recorded. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}
export const SPLIT_RULE_LABELS: Record<SplitRule, string> = {
  proportional: 'Proporcional',
  teacher_first: 'Primero el profesor',
  local_first: 'Primero el local',
};
export const PASS_KIND_LABELS: Record<PassKind, string> = { free: 'Libre', teacher: 'Con profesor' };
export const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;

export function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

export function waiverLabel(waiver: WaiverStatus): string {
  if (waiver.state === 'valid') return `Ficha vigente hasta ${formatDate(waiver.expiresAt ?? '')}`;
  if (waiver.state === 'expired') return `Ficha vencida desde ${formatDate(waiver.expiresAt ?? '')}`;
  return 'Sin ficha firmada';
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

/** Current local month as "YYYY-MM" (what <input type="month"> uses). */
export function currentMonthIso(): string {
  return todayIso().slice(0, 7);
}

export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`;
}

export function ageLabel(birthDate: string | null): string {
  return birthDate ? `${ageFrom(birthDate, todayIso())} años` : 'Edad sin datos';
}

function sinceLabel(days: number): string {
  if (days === 0) return 'desde hoy';
  return days === 1 ? 'hace 1 día' : `hace ${days} días`;
}

/** "Debe $X · hace N días", counting from the oldest sale that still has debt. */
export function debtLabel({ debtCents, debtDays }: { debtCents: number; debtDays: number | null }): string {
  const amount = `Debe ${formatMoney(debtCents)}`;
  return debtDays === null ? amount : `${amount} · ${sinceLabel(debtDays)}`;
}

/** Current month in Spanish, lowercase ("octubre"). */
export function currentMonthLabel(): string {
  return new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(new Date());
}

/** "YYYY-MM" of an ISO timestamp, in local time (what <input type="month"> uses). */
export function localMonth(iso: string): string {
  return toIsoDate(new Date(iso)).slice(0, 7);
}

const MONTH_ABBREVIATIONS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Axis label of a chart bucket: "05/10", "sem. 05/10" or "oct 2026". */
export function bucketLabel(bucket: string, granularity: Granularity): string {
  if (granularity === 'month') return `${MONTH_ABBREVIATIONS[Number(bucket.slice(5, 7)) - 1] ?? ''} ${bucket.slice(0, 4)}`;
  const dayMonth = `${bucket.slice(8, 10)}/${bucket.slice(5, 7)}`;
  return granularity === 'week' ? `sem. ${dayMonth}` : dayMonth;
}

/** Short money for chart axes: "$ 450 mil", "$ 1,2 M" (Intl's compact notation says "k" in Electron's ICU). */
export function formatCompactMoney(cents: number): string {
  const pesos = cents / 100;
  const size = Math.abs(pesos);
  const [value, unit] = size >= 1_000_000 ? [pesos / 1_000_000, ' M'] : size >= 1_000 ? [pesos / 1_000, ' mil'] : [pesos, ''];
  return `$ ${value.toLocaleString('es-AR', { maximumFractionDigits: 1 })}${unit}`;
}

/** "+20 %", "−5 %" (or points: "+3 pts"), or "—" when there is nothing to compare with. */
export function formatPercentChange(change: number | null, unit: '%' | 'pts' = '%'): string {
  if (change === null) return '—';
  if (change > 0) return `+${change} ${unit}`;
  return change < 0 ? `−${-change} ${unit}` : `0 ${unit}`;
}
