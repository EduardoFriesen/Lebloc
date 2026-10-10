import { ageFrom } from '../../domain/client';
import { toIsoDate } from '../../domain/dates';
import type { PassKind } from '../../domain/passes';
import type { SplitRule } from '../../domain/sale';
import type { PaymentMethod, WaiverStatus } from '../../shared/types';

import { formatMoney } from '../../shared/money';

export { formatMoney, formatMoneyInput } from '../../shared/money';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { cash: 'Efectivo', transfer: 'Transferencia' };
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
