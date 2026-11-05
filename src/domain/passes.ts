import { addMonths, daysBetween } from './dates';
import { DomainError } from './errors';

export type PassKind = 'free' | 'teacher';

export interface PassCounts {
  free: number;
  teacher: number;
}

export interface SaleAvailability {
  saleId: number;
  soldAt: string;
  remaining: PassCounts;
}

export function remainingPasses(granted: PassCounts, used: PassCounts): PassCounts {
  return { free: granted.free - used.free, teacher: granted.teacher - used.teacher };
}

export function totalPasses(counts: PassCounts): number {
  return counts.free + counts.teacher;
}

export function isLowOnPasses(remainingTotal: number, threshold: number): boolean {
  return remainingTotal <= threshold;
}

/** Passes last a month unless the sale says otherwise. */
export function defaultExpiry(soldAt: string): string {
  return addMonths(soldAt, 1);
}

/** A sale's passes can be used up to its expiry date, inclusive; after that the ones left are lost. */
export function isExpired(expiresAt: string, today: string): boolean {
  return expiresAt < today;
}

export type PassStatus = 'ok' | 'low' | 'expiring' | 'none';

export interface PassWarnings {
  lowPassesThreshold: number;
  expiryWarningDays: number;
}

/**
 * Drives the card color: none (no passes left, or never bought), expiring (the passes left all expire within the
 * warning days: losing them is closer than using them up), low (few left), ok. `expiresAt` is the last day any of
 * the passes left can be used.
 */
export function passStatus(remainingTotal: number, expiresAt: string | null, today: string, warnings: PassWarnings): PassStatus {
  if (remainingTotal <= 0) return 'none';
  if (expiresAt !== null && daysBetween(today, expiresAt) <= warnings.expiryWarningDays) return 'expiring';
  return isLowOnPasses(remainingTotal, warnings.lowPassesThreshold) ? 'low' : 'ok';
}

export function pickSaleForConsumption(sales: readonly SaleAvailability[], kind: PassKind): number {
  const [oldest] = sales
    .filter((sale) => sale.remaining[kind] > 0)
    .sort((a, b) => a.soldAt.localeCompare(b.soldAt) || a.saleId - b.saleId);
  if (!oldest) throw new DomainError('NO_PASSES_AVAILABLE');
  return oldest.saleId;
}
