import type { WaiverSignature } from '../../shared/types';
import type { Db } from '../db/connection';

export interface ClientWaiverRow {
  clientId: number;
  clientName: string;
  signedAt: string | null;
}

const COLUMNS = 'id, client_id AS clientId, signed_at AS signedAt, recorded_at AS recordedAt, voided_at AS voidedAt';

export const LAST_SIGNED_AT_SQL = `(SELECT MAX(w.signed_at) FROM waiver_signatures w
  WHERE w.client_id = c.id AND w.voided_at IS NULL)`;

export function insertWaiver(db: Db, clientId: number, signedAt: string, now: string): number {
  const result = db
    .prepare('INSERT INTO waiver_signatures (client_id, signed_at, recorded_at) VALUES (?, ?, ?)')
    .run(clientId, signedAt, now);
  return Number(result.lastInsertRowid);
}

export function findWaiver(db: Db, id: number): WaiverSignature | undefined {
  return db.prepare<[number], WaiverSignature>(`SELECT ${COLUMNS} FROM waiver_signatures WHERE id = ?`).get(id);
}

export function listWaiversForClient(db: Db, clientId: number): WaiverSignature[] {
  return db
    .prepare<[number], WaiverSignature>(
      `SELECT ${COLUMNS} FROM waiver_signatures WHERE client_id = ? ORDER BY signed_at DESC, id DESC`,
    )
    .all(clientId);
}

export function voidWaiver(db: Db, id: number, now: string): void {
  db.prepare('UPDATE waiver_signatures SET voided_at = ? WHERE id = ?').run(now, id);
}

export function listActiveClientWaivers(db: Db): ClientWaiverRow[] {
  return db
    .prepare<[], ClientWaiverRow>(
      `SELECT c.id AS clientId, c.first_name || ' ' || c.last_name AS clientName, ${LAST_SIGNED_AT_SQL} AS signedAt
       FROM clients c
       WHERE c.archived_at IS NULL
       ORDER BY c.last_name COLLATE NOCASE, c.first_name COLLATE NOCASE`,
    )
    .all();
}
