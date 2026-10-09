import { DomainError } from '../../domain/errors';
import { waiverStatus, type WaiverStatus } from '../../domain/waiver';
import type { WaiverInput } from '../../shared/schemas';
import type { WaiverAlert, WaiverSignature } from '../../shared/types';
import { type Context, nowIso, today } from '../context';
import * as repo from '../repos/waivers';
import { requireActiveClient } from './clients';
import { getSettings } from './settings';

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

/** Returns a function that maps the last signing date to its status, reading the settings once. */
export function waiverStatusResolver(ctx: Context): (lastSignedAt: string | null) => WaiverStatus {
  const { waiverValidityMonths } = getSettings(ctx);
  const now = today(ctx);
  return (lastSignedAt) => waiverStatus(lastSignedAt, waiverValidityMonths, now);
}

export function listWaiverAlerts(ctx: Context): WaiverAlert[] {
  const statusOf = waiverStatusResolver(ctx);
  return repo
    .listActiveClientWaivers(ctx.db)
    .map(({ clientId, clientName, signedAt }) => ({ clientId, clientName, ...statusOf(signedAt) }))
    .filter((alert) => alert.state !== 'valid')
    .map(({ clientId, clientName, state, expiresAt }) => ({ clientId, clientName, state, expiresAt }));
}
