import type { PassKind } from '../../domain/passes';
import type { Consumption } from '../../shared/types';
import type { Db } from '../db/connection';

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

export function voidConsumption(db: Db, id: number, now: string): void {
  db.prepare('UPDATE consumptions SET voided_at = ? WHERE id = ?').run(now, id);
}
