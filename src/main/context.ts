import { toIsoDate } from '../domain/dates';
import { DomainError } from '../domain/errors';
import type { Db } from './db/connection';

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export interface Context {
  readonly db: Db;
  readonly clock: Clock;
}

export function nowIso(ctx: Context): string {
  return ctx.clock.now().toISOString();
}

export function today(ctx: Context): string {
  return toIsoDate(ctx.clock.now());
}

/** Dates the user types (a sale, a payment, a birth date...) can be today at most: a typo must not land in the future. */
export function assertNotFuture(ctx: Context, ...dates: string[]): void {
  const now = today(ctx);
  if (dates.some((date) => date > now)) throw new DomainError('DATE_IN_FUTURE');
}
