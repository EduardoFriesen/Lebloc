import type { ClientInput, GuardianInput } from '../../shared/schemas';
import { fold } from '../../shared/text';
import type { Client, ClientSummary, Guardian } from '../../shared/types';
import type { Db } from '../db/connection';
import { SALE_STATS_CTE } from './saleStats';
import { LAST_SIGNED_AT_SQL } from './waivers';

export type ClientSummaryRow = Omit<ClientSummary, 'waiver' | 'debtDays' | 'passStatus'> & {
  waiverSignedAt: string | null;
  oldestDebtSoldAt: string | null;
};

// Imported clients may come without a birth date; the form asks for it the next time they're edited.
export type ClientFields = Omit<ClientInput, 'guardians' | 'birthDate'> & { birthDate: string | null };
export type ClientRow = Omit<Client, 'guardians'>;

const CLIENT_COLUMNS = `id, first_name AS firstName, last_name AS lastName, birth_date AS birthDate, dni, notes, address, phone,
  emergency_name AS emergencyName, emergency_phone AS emergencyPhone, emergency_relation AS emergencyRelation,
  enrolled_at AS enrolledAt, updated_at AS updatedAt, archived_at AS archivedAt, anonymized_at AS anonymizedAt`;

function clientParams(fields: ClientFields) {
  return {
    firstName: fields.firstName,
    lastName: fields.lastName,
    birthDate: fields.birthDate,
    dni: fields.dni,
    notes: fields.notes,
    address: fields.address,
    phone: fields.phone,
    emergencyName: fields.emergencyName,
    emergencyPhone: fields.emergencyPhone,
    emergencyRelation: fields.emergencyRelation,
    enrolledAt: fields.enrolledAt,
  };
}

export function insertClient(db: Db, fields: ClientFields, now: string): number {
  const result = db
    .prepare(
      `INSERT INTO clients (first_name, last_name, birth_date, dni, notes, address, phone, emergency_name, emergency_phone,
         emergency_relation, enrolled_at, updated_at)
       VALUES (@firstName, @lastName, @birthDate, @dni, @notes, @address, @phone, @emergencyName, @emergencyPhone,
         @emergencyRelation, @enrolledAt, @now)`,
    )
    .run({ ...clientParams(fields), now });
  return Number(result.lastInsertRowid);
}

export function updateClient(db: Db, id: number, fields: ClientFields, now: string): void {
  db.prepare(
    `UPDATE clients SET first_name = @firstName, last_name = @lastName, birth_date = @birthDate, dni = @dni, notes = @notes,
       address = @address,
       phone = @phone, emergency_name = @emergencyName, emergency_phone = @emergencyPhone,
       emergency_relation = @emergencyRelation, enrolled_at = @enrolledAt, updated_at = @now
     WHERE id = @id`,
  ).run({ ...clientParams(fields), now, id });
}

export function countClients(db: Db): number {
  return db.prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM clients').get()?.count ?? 0;
}

export function findClientRow(db: Db, id: number): ClientRow | undefined {
  return db.prepare<[number], ClientRow>(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE id = ?`).get(id);
}

export function listGuardians(db: Db, clientId: number): Guardian[] {
  return db
    .prepare<[number], Guardian>(
      `SELECT id, client_id AS clientId, first_name AS firstName, last_name AS lastName, dni, phone, relation
       FROM guardians WHERE client_id = ? ORDER BY id`,
    )
    .all(clientId);
}

export function replaceGuardians(db: Db, clientId: number, guardians: readonly GuardianInput[]): void {
  db.prepare('DELETE FROM guardians WHERE client_id = ?').run(clientId);
  const insert = db.prepare(
    `INSERT INTO guardians (client_id, first_name, last_name, dni, phone, relation)
     VALUES (@clientId, @firstName, @lastName, @dni, @phone, @relation)`,
  );
  for (const guardian of guardians) {
    insert.run({
      clientId,
      firstName: guardian.firstName,
      lastName: guardian.lastName,
      dni: guardian.dni,
      phone: guardian.phone,
      relation: guardian.relation,
    });
  }
}

export function setArchivedAt(db: Db, id: number, archivedAt: string | null, now: string): void {
  db.prepare('UPDATE clients SET archived_at = @archivedAt, updated_at = @now WHERE id = @id').run({ id, archivedAt, now });
}

export function anonymizeClient(db: Db, id: number, now: string): void {
  db.prepare(
    `UPDATE clients SET first_name = 'Cliente', last_name = 'anonimizado #' || id, birth_date = NULL, dni = NULL, notes = NULL,
       address = NULL,
       phone = NULL, emergency_name = NULL, emergency_phone = NULL, emergency_relation = NULL,
       anonymized_at = @now, updated_at = @now
     WHERE id = @id`,
  ).run({ id, now });
  db.prepare('DELETE FROM guardians WHERE client_id = ?').run(id);
}

export interface ClientCounts {
  active: number;
  archived: number;
  minors: number;
  newThisMonth: number;
}

/** Active vs archived clients; active ones born after `bornAfter` and enrolled on or after `from` (ISO dates). */
export function clientCounts(db: Db, filters: { from: string; bornAfter: string }): ClientCounts {
  return db
    .prepare<[{ from: string; bornAfter: string }], ClientCounts>(
      `SELECT COUNT(CASE WHEN archived_at IS NULL THEN 1 END) AS active,
         COUNT(archived_at) AS archived,
         COUNT(CASE WHEN archived_at IS NULL AND birth_date > @bornAfter THEN 1 END) AS minors,
         COUNT(CASE WHEN archived_at IS NULL AND enrolled_at >= @from THEN 1 END) AS newThisMonth
       FROM clients`,
    )
    .get(filters) as ClientCounts;
}

export interface ClientSummaryFilters {
  search: string;
  includeArchived: boolean;
  onlyDebtors: boolean;
  onlyWithPasses?: boolean;
  onlyWithoutPasses?: boolean;
  onlyArchived?: boolean;
  /** ISO date: only clients born after it (see `minorBirthCutoff`). */
  bornAfter?: string;
  /** ISO date: only clients enrolled on or after it. */
  enrolledFrom?: string;
  /** ISO timestamp: only clients with an active consumption since then. */
  attendedFrom?: string;
  /** ISO date: passes of sales that expired before it are lost. */
  today: string;
}

export function listClientSummaries(db: Db, filters: ClientSummaryFilters): ClientSummaryRow[] {
  return db
    .prepare<[Record<string, string | number | null>], ClientSummaryRow>(
      `WITH ${SALE_STATS_CTE}
       SELECT c.id, c.first_name AS firstName, c.last_name AS lastName, c.birth_date AS birthDate, c.dni,
         c.archived_at AS archivedAt,
         COUNT(ss.id) AS activeSales,
         COALESCE(SUM(ss.left_free), 0) AS remainingFree,
         COALESCE(SUM(ss.left_teacher), 0) AS remainingTeacher,
         MAX(CASE WHEN ss.left_free + ss.left_teacher > 0 THEN ss.expires_at END) AS expiresAt,
         COALESCE(SUM(ss.total_cents - ss.paid_cents), 0) AS debtCents,
         MIN(CASE WHEN ss.total_cents - ss.paid_cents > 0 THEN ss.sold_at END) AS oldestDebtSoldAt,
         ${LAST_SIGNED_AT_SQL} AS waiverSignedAt
       FROM clients c
       LEFT JOIN sale_stats ss ON ss.client_id = c.id
       WHERE (CASE WHEN @onlyArchived = 1 THEN c.archived_at IS NOT NULL ELSE @includeArchived = 1 OR c.archived_at IS NULL END)
         AND (@bornAfter IS NULL OR c.birth_date > @bornAfter)
         AND (@enrolledFrom IS NULL OR c.enrolled_at >= @enrolledFrom)
         AND (@search = ''
           OR instr(fold(c.first_name || ' ' || c.last_name), @search) > 0
           OR instr(fold(c.last_name || ' ' || c.first_name), @search) > 0
           OR instr(c.dni, @search) > 0)
         AND (@attendedFrom IS NULL OR EXISTS (
           SELECT 1 FROM consumptions co JOIN sales s ON s.id = co.sale_id
           WHERE s.client_id = c.id AND co.voided_at IS NULL AND co.consumed_at >= @attendedFrom))
       GROUP BY c.id
       HAVING (@onlyDebtors = 0 OR debtCents > 0) AND (@onlyWithPasses = 0 OR remainingFree + remainingTeacher > 0)
         AND (@onlyWithoutPasses = 0 OR remainingFree + remainingTeacher = 0)
       ORDER BY CASE WHEN @onlyDebtors = 1 THEN oldestDebtSoldAt END, c.last_name COLLATE NOCASE, c.first_name COLLATE NOCASE`,
    )
    .all({
      search: fold(filters.search),
      includeArchived: filters.includeArchived ? 1 : 0,
      onlyDebtors: filters.onlyDebtors ? 1 : 0,
      onlyWithPasses: filters.onlyWithPasses ? 1 : 0,
      onlyWithoutPasses: filters.onlyWithoutPasses ? 1 : 0,
      onlyArchived: filters.onlyArchived ? 1 : 0,
      bornAfter: filters.bornAfter ?? null,
      enrolledFrom: filters.enrolledFrom ?? null,
      attendedFrom: filters.attendedFrom ?? null,
      today: filters.today,
    });
}
