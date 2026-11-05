import type { PassKind } from '../../domain/passes';
import type { Consumption } from '../../shared/types';
import type { Db } from '../db/connection';
import { SALE_STATS_CTE } from './saleStats';

export interface NewConsumption {
  saleId: number;
  kind: PassKind;
  consumedAt: string;
  note: string | null;
}

const CONSUMPTION_COLUMNS = 'c.id, c.sale_id AS saleId, c.kind, c.consumed_at AS consumedAt, c.note, c.voided_at AS voidedAt';

export function insertConsumption(db: Db, consumption: NewConsumption): number {
  const result = db
    .prepare('INSERT INTO consumptions (sale_id, kind, consumed_at, note) VALUES (@saleId, @kind, @consumedAt, @note)')
    .run({ saleId: consumption.saleId, kind: consumption.kind, consumedAt: consumption.consumedAt, note: consumption.note });
  return Number(result.lastInsertRowid);
}

export function findConsumption(db: Db, id: number): Consumption | undefined {
  return db.prepare<[number], Consumption>(`SELECT ${CONSUMPTION_COLUMNS} FROM consumptions c WHERE c.id = ?`).get(id);
}

export function listConsumptionsForClient(db: Db, clientId: number): Consumption[] {
  return db
    .prepare<[number], Consumption>(
      `SELECT ${CONSUMPTION_COLUMNS} FROM consumptions c JOIN sales s ON s.id = c.sale_id
       WHERE s.client_id = ? ORDER BY c.consumed_at DESC, c.id DESC`,
    )
    .all(clientId);
}

export interface ConsumptionEntryRow {
  consumptionId: number;
  clientId: number;
  clientName: string;
  passKind: PassKind;
  recordedAt: string;
  remainingFree: number;
  remainingTeacher: number;
  expiresAt: string | null;
}

/** Active consumptions since `from` (ISO timestamp), with the client's passes left today, newest first. */
export function listConsumptionsSince(db: Db, from: string, today: string): ConsumptionEntryRow[] {
  return db
    .prepare<[{ from: string; today: string }], ConsumptionEntryRow>(
      `WITH ${SALE_STATS_CTE},
       client_left AS (
         SELECT client_id, SUM(left_free) AS free_left, SUM(left_teacher) AS teacher_left,
           MAX(CASE WHEN left_free + left_teacher > 0 THEN expires_at END) AS expires_at
         FROM sale_stats GROUP BY client_id
       )
       SELECT c.id AS consumptionId, cl.id AS clientId, trim(cl.first_name || ' ' || cl.last_name) AS clientName,
         c.kind AS passKind, c.consumed_at AS recordedAt,
         COALESCE(l.free_left, 0) AS remainingFree, COALESCE(l.teacher_left, 0) AS remainingTeacher, l.expires_at AS expiresAt
       FROM consumptions c JOIN sales s ON s.id = c.sale_id JOIN clients cl ON cl.id = s.client_id
       LEFT JOIN client_left l ON l.client_id = cl.id
       WHERE c.voided_at IS NULL AND c.consumed_at >= @from
       ORDER BY c.consumed_at DESC, c.id DESC`,
    )
    .all({ from, today });
}

export function voidConsumption(db: Db, id: number, now: string): void {
  db.prepare('UPDATE consumptions SET voided_at = ? WHERE id = ?').run(now, id);
}
