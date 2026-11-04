import { assertGuardianRule, minorBirthCutoff } from '../../domain/client';
import { monthStart, todayStart } from '../../domain/attendance';
import { daysBetween } from '../../domain/dates';
import { DomainError } from '../../domain/errors';
import { passStatus } from '../../domain/passes';
import { waiverStatus } from '../../domain/waiver';
import type { ClientInput, ClientListInput, ClientUpdate } from '../../shared/schemas';
import type { Client, ClientSummary } from '../../shared/types';
import { assertNotFuture, type Context, nowIso, today } from '../context';
import { insertAudit } from '../repos/audit';
import * as repo from '../repos/clients';
import { getSettings } from './settings';

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

function summaries(ctx: Context, filters: Omit<repo.ClientSummaryFilters, 'today'>): ClientSummary[] {
  const settings = getSettings(ctx);
  const now = today(ctx);
  return repo.listClientSummaries(ctx.db, { ...filters, today: now }).map(({ waiverSignedAt, oldestDebtSoldAt, ...summary }) => ({
    ...summary,
    debtDays: oldestDebtSoldAt === null ? null : daysBetween(oldestDebtSoldAt, now),
    passStatus: passStatus(summary.remainingFree + summary.remainingTeacher, summary.expiresAt, now, settings),
    waiver: waiverStatus(waiverSignedAt),
  }));
}

export function listClients(ctx: Context, input: ClientListInput): ClientSummary[] {
  const { onlyMinors, onlyNewThisMonth, ...filters } = input;
  const clients = summaries(ctx, {
    ...filters,
    bornAfter: onlyMinors ? minorBirthCutoff(today(ctx)) : undefined,
    enrolledFrom: onlyNewThisMonth ? monthStart(ctx.clock.now()) : undefined,
  });
  return input.onlyPendingWaiver ? clients.filter((client) => client.waiver.state === 'missing') : clients;
}

/** Who owes money and had a pass marked today, oldest debt first. */
export function listTodayDebtors(ctx: Context): ClientSummary[] {
  const attendedFrom = todayStart(ctx.clock.now()).toISOString();
  return summaries(ctx, { search: '', includeArchived: false, onlyDebtors: true, attendedFrom });
}

export function createClient(ctx: Context, input: ClientInput): Client {
  assertNotFuture(ctx, input.birthDate, input.enrolledAt);
  assertGuardianRule(input.birthDate, input.guardians.length, today(ctx));
  return ctx.db.transaction(() => {
    const id = repo.insertClient(ctx.db, input);
    repo.replaceGuardians(ctx.db, id, input.guardians);
    return getClient(ctx, id);
  })();
}

export function updateClient(ctx: Context, input: ClientUpdate): Client {
  requireActiveClient(ctx, input.id);
  assertNotFuture(ctx, input.birthDate, input.enrolledAt);
  assertGuardianRule(input.birthDate, input.guardians.length, today(ctx));
  return ctx.db.transaction(() => {
    repo.updateClient(ctx.db, input.id, input);
    repo.replaceGuardians(ctx.db, input.id, input.guardians);
    return getClient(ctx, input.id);
  })();
}

export function archiveClient(ctx: Context, id: number): Client {
  requireActiveClient(ctx, id);
  repo.setArchivedAt(ctx.db, id, nowIso(ctx));
  return getClient(ctx, id);
}

export function unarchiveClient(ctx: Context, id: number): Client {
  const client = getClient(ctx, id);
  if (client.anonymizedAt) throw new DomainError('CLIENT_ANONYMIZED');
  repo.setArchivedAt(ctx.db, id, null);
  return getClient(ctx, id);
}

export function anonymizeClient(ctx: Context, id: number): Client {
  const client = getClient(ctx, id);
  if (!client.archivedAt) throw new DomainError('CLIENT_NOT_ARCHIVED');
  if (client.anonymizedAt) throw new DomainError('CLIENT_ANONYMIZED');
  ctx.db.transaction(() => {
    const now = nowIso(ctx);
    repo.anonymizeClient(ctx.db, id, now);
    // By id only: the log must not keep the personal data that was just wiped.
    insertAudit(ctx.db, { at: now, action: 'client_anonymized', subjectId: id, detail: null });
  })();
  return getClient(ctx, id);
}
