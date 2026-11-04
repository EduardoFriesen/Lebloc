import { DomainError } from '../../domain/errors';
import type { WaiverInput } from '../../shared/schemas';
import type { WaiverSignature } from '../../shared/types';
import { type Context, nowIso, today } from '../context';
import * as repo from '../repos/waivers';
import { requireActiveClient } from './clients';

export function getWaiver(ctx: Context, id: number): WaiverSignature {
  const waiver = repo.findWaiver(ctx.db, id);
  if (!waiver) throw new DomainError('NOT_FOUND');
  return waiver;
}

export function signWaiver(ctx: Context, input: WaiverInput): WaiverSignature {
  requireActiveClient(ctx, input.clientId);
  if (input.signedAt > today(ctx)) throw new DomainError('WAIVER_DATE_IN_FUTURE');
  return getWaiver(ctx, repo.insertWaiver(ctx.db, input.clientId, input.signedAt, nowIso(ctx)));
}

export function voidWaiver(ctx: Context, id: number): WaiverSignature {
  const waiver = getWaiver(ctx, id);
  if (waiver.voidedAt) throw new DomainError('ALREADY_VOIDED');
  requireActiveClient(ctx, waiver.clientId);
  repo.voidWaiver(ctx.db, id, nowIso(ctx));
  return getWaiver(ctx, id);
}

/** Active clients that never handed in the waiver (or whose deliveries were all voided). */
export function countMissingWaivers(ctx: Context): number {
  return repo.countMissingWaivers(ctx.db);
}
