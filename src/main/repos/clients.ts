import type { ClientInput, GuardianInput } from '../../shared/schemas';
import type { Client, ClientSummary, Guardian } from '../../shared/types';
import type { Db } from '../db/connection';
import { escapeLike, SALE_STATS_CTE } from './saleStats';
import { LAST_SIGNED_AT_SQL } from './waivers';

export type ClientSummaryRow = Omit<ClientSummary, 'waiver'> & { waiverSignedAt: string | null };

export type ClientFields = Omit<ClientInput, 'guardians'>;
export type ClientRow = Omit<Client, 'guardians'>;

const CLIENT_COLUMNS = `id, first_name AS firstName, last_name AS lastName, birth_date AS birthDate, address, phone,
  emergency_name AS emergencyName, emergency_phone AS emergencyPhone, emergency_relation AS emergencyRelation,
  enrolled_at AS enrolledAt, updated_at AS updatedAt, archived_at AS archivedAt, anonymized_at AS anonymizedAt`;

function clientParams(fields: ClientFields) {
  return {
    firstName: fields.firstName,
    lastName: fields.lastName,
    birthDate: fields.birthDate,
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
      `INSERT INTO clients (first_name, last_name, birth_date, address, phone, emergency_name, emergency_phone,
         emergency_relation, enrolled_at, updated_at)
       VALUES (@firstName, @lastName, @birthDate, @address, @phone, @emergencyName, @emergencyPhone,
         @emergencyRelation, @enrolledAt, @now)`,
    )
    .run({ ...clientParams(fields), now });
  return Number(result.lastInsertRowid);
}

export function updateClient(db: Db, id: number, fields: ClientFields, now: string): void {
  db.prepare(
    `UPDATE clients SET first_name = @firstName, last_name = @lastName, birth_date = @birthDate, address = @address,
       phone = @phone, emergency_name = @emergencyName, emergency_phone = @emergencyPhone,
       emergency_relation = @emergencyRelation, enrolled_at = @enrolledAt, updated_at = @now
     WHERE id = @id`,
  ).run({ ...clientParams(fields), now, id });
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
    `UPDATE clients SET first_name = 'Cliente', last_name = 'anonimizado #' || id, birth_date = NULL, address = NULL,
       phone = NULL, emergency_name = NULL, emergency_phone = NULL, emergency_relation = NULL,
       anonymized_at = @now, updated_at = @now
     WHERE id = @id`,
  ).run({ id, now });
  db.prepare('DELETE FROM guardians WHERE client_id = ?').run(id);
}

export function listClientSummaries(db: Db, search: string, includeArchived: boolean): ClientSummaryRow[] {
  return db
    .prepare<[{ search: string; includeArchived: number }], ClientSummaryRow>(
      `WITH ${SALE_STATS_CTE}
       SELECT c.id, c.first_name AS firstName, c.last_name AS lastName, c.birth_date AS birthDate,
         c.archived_at AS archivedAt,
         COUNT(ss.id) AS activeSales,
         COALESCE(SUM(ss.free_passes - ss.used_free), 0) AS remainingFree,
         COALESCE(SUM(ss.teacher_passes - ss.used_teacher), 0) AS remainingTeacher,
         COALESCE(SUM(ss.total_cents - ss.paid_cents), 0) AS debtCents,
         ${LAST_SIGNED_AT_SQL} AS waiverSignedAt
       FROM clients c
       LEFT JOIN sale_stats ss ON ss.client_id = c.id
       WHERE (@includeArchived = 1 OR c.archived_at IS NULL)
         AND (@search = ''
           OR (c.first_name || ' ' || c.last_name) LIKE '%' || @search || '%' ESCAPE '\\'
           OR (c.last_name || ' ' || c.first_name) LIKE '%' || @search || '%' ESCAPE '\\')
       GROUP BY c.id
       ORDER BY c.last_name COLLATE NOCASE, c.first_name COLLATE NOCASE
       LIMIT 200`,
    )
    .all({ search: escapeLike(search), includeArchived: includeArchived ? 1 : 0 });
}
