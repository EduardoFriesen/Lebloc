import { assertGuardianRule } from '../../domain/client';
import { attendanceWindows } from '../../domain/attendance';
import { daysBetween } from '../../domain/dates';
import { DomainError } from '../../domain/errors';
import { passStatus } from '../../domain/passes';
import type { ClientInput, ClientListInput, ClientUpdate } from '../../shared/schemas';
import type { Client, ClientSummary } from '../../shared/types';
import { type Context, nowIso, today } from '../context';
import * as repo from '../repos/clients';
import { getSettings } from './settings';
import { waiverStatusResolver } from './waivers';

export function getClient(ctx: Context, id: number): Client {
  const row = repo.findClientRow(ctx.db, id);
  if (!row) throw new DomainError('NOT_FOUND');
  return { ...row, guardians: repo.listGuardians(ctx.db, id) };
}

export function requireActiveClient(ctx: Context, id: number): Client {
  const client = getClient(ctx, id);
  if (client.archivedAt) throw new DomainError('CLIENT_ARCHIVED');
  return client;
}

function summaries(ctx: Context, filters: repo.ClientSummaryFilters): ClientSummary[] {
  const statusOf = waiverStatusResolver(ctx);
  const { lowPassesThreshold } = getSettings(ctx);
  const now = today(ctx);
  return repo.listClientSummaries(ctx.db, filters).map(({ waiverSignedAt, oldestDebtSoldAt, ...summary }) => ({
    ...summary,
    debtDays: oldestDebtSoldAt === null ? null : daysBetween(oldestDebtSoldAt, now),
    passStatus: passStatus(summary.remainingFree + summary.remainingTeacher, lowPassesThreshold),
    waiver: statusOf(waiverSignedAt),
  }));
}

export function listClients(ctx: Context, input: ClientListInput): ClientSummary[] {
  const clients = summaries(ctx, input);
  // ponytail: filters after the query's LIMIT 200; move the waiver rule to SQL if there are ever more clients than that.
  return input.onlyPendingWaiver ? clients.filter((client) => client.waiver.state !== 'valid') : clients;
}

/** Preload for the counter: who came last week around this time and hasn't come yet today. */
export function listUsualAttendees(ctx: Context): ClientSummary[] {
  const { usualSlot, todayStart } = attendanceWindows(ctx.clock.now());
  return summaries(ctx, {
    search: '',
    includeArchived: false,
    onlyDebtors: false,
    attendedFrom: usualSlot.from.toISOString(),
    attendedTo: usualSlot.to.toISOString(),
    notAttendedSince: todayStart.toISOString(),
  });
}

/** Who has to renew: low or no passes, and came in the last 30 days. Those with no passes first. */
export function listRenewals(ctx: Context): ClientSummary[] {
  const { renewalFrom } = attendanceWindows(ctx.clock.now());
  const recent = summaries(ctx, { search: '', includeArchived: false, onlyDebtors: false, attendedFrom: renewalFrom.toISOString() });
  return recent
    .filter((client) => client.passStatus !== 'ok')
    .sort((a, b) => Number(b.passStatus === 'none') - Number(a.passStatus === 'none'));
}

export function createClient(ctx: Context, input: ClientInput): Client {
  assertGuardianRule(input.birthDate, input.guardians.length, today(ctx));
  return ctx.db.transaction(() => {
    const id = repo.insertClient(ctx.db, input, nowIso(ctx));
    repo.replaceGuardians(ctx.db, id, input.guardians);
    return getClient(ctx, id);
  })();
}

export function updateClient(ctx: Context, input: ClientUpdate): Client {
  requireActiveClient(ctx, input.id);
  assertGuardianRule(input.birthDate, input.guardians.length, today(ctx));
  return ctx.db.transaction(() => {
    repo.updateClient(ctx.db, input.id, input, nowIso(ctx));
    repo.replaceGuardians(ctx.db, input.id, input.guardians);
    return getClient(ctx, input.id);
  })();
}

export function archiveClient(ctx: Context, id: number): Client {
  requireActiveClient(ctx, id);
  const now = nowIso(ctx);
  repo.setArchivedAt(ctx.db, id, now, now);
  return getClient(ctx, id);
}

export function unarchiveClient(ctx: Context, id: number): Client {
  const client = getClient(ctx, id);
  if (client.anonymizedAt) throw new DomainError('CLIENT_ANONYMIZED');
  repo.setArchivedAt(ctx.db, id, null, nowIso(ctx));
  return getClient(ctx, id);
}

export function anonymizeClient(ctx: Context, id: number): Client {
  const client = getClient(ctx, id);
  if (!client.archivedAt) throw new DomainError('CLIENT_NOT_ARCHIVED');
  if (client.anonymizedAt) throw new DomainError('CLIENT_ANONYMIZED');
  ctx.db.transaction(() => repo.anonymizeClient(ctx.db, id, nowIso(ctx)))();
  return getClient(ctx, id);
}
