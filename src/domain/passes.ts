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

export type PassStatus = 'ok' | 'low' | 'none';

/** Drives the card color: none (no passes left, or never bought), low (up to the threshold), ok. */
export function passStatus(remainingTotal: number, threshold: number): PassStatus {
  if (remainingTotal <= 0) return 'none';
  return isLowOnPasses(remainingTotal, threshold) ? 'low' : 'ok';
}

export function pickSaleForConsumption(sales: readonly SaleAvailability[], kind: PassKind): number {
  const [oldest] = sales
    .filter((sale) => sale.remaining[kind] > 0)
    .sort((a, b) => a.soldAt.localeCompare(b.soldAt) || a.saleId - b.saleId);
  if (!oldest) throw new DomainError('NO_PASSES_AVAILABLE');
  return oldest.saleId;
}
