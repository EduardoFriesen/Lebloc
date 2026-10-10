import { assertGuardianRule } from '../../domain/client';
import { daysBetween } from '../../domain/dates';
import { DomainError } from '../../domain/errors';
import type { ClientInput, ClientListInput, ClientUpdate } from '../../shared/schemas';
import type { Client, ClientSummary } from '../../shared/types';
import { type Context, nowIso, today } from '../context';
import * as repo from '../repos/clients';
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

export function listClients(ctx: Context, input: ClientListInput): ClientSummary[] {
  const statusOf = waiverStatusResolver(ctx);
  const now = today(ctx);
  return repo
    .listClientSummaries(ctx.db, input.search, input.includeArchived, input.onlyDebtors)
    .map(({ waiverSignedAt, oldestDebtSoldAt, ...summary }) => ({
      ...summary,
      debtDays: oldestDebtSoldAt === null ? null : daysBetween(oldestDebtSoldAt, now),
      waiver: statusOf(waiverSignedAt),
    }));
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
