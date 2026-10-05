import { toIsoDate } from '../domain/dates';
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
