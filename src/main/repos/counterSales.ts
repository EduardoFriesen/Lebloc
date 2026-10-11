import type { CounterSale, CounterSaleKind, PaymentMethod } from '../../shared/types';
import type { Db } from '../db/connection';

const COLUMNS = 'id, kind, price_cents AS priceCents, method, sold_at AS soldAt, recorded_at AS recordedAt, voided_at AS voidedAt';

export function insertCounterSale(
  db: Db,
  sale: { kind: CounterSaleKind; priceCents: number; method: PaymentMethod; soldAt: string; recordedAt: string },
): number {
  const result = db
    .prepare(
      `INSERT INTO counter_sales (kind, price_cents, method, sold_at, recorded_at)
       VALUES (@kind, @priceCents, @method, @soldAt, @recordedAt)`,
    )
    .run(sale);
  return Number(result.lastInsertRowid);
}

export function findCounterSale(db: Db, id: number): CounterSale | undefined {
  return db.prepare<[number], CounterSale>(`SELECT ${COLUMNS} FROM counter_sales WHERE id = ?`).get(id);
}

export function listCounterSalesOn(db: Db, date: string): CounterSale[] {
  return db.prepare<[string], CounterSale>(`SELECT ${COLUMNS} FROM counter_sales WHERE sold_at = ? ORDER BY id DESC`).all(date);
}

export function voidCounterSale(db: Db, id: number, now: string): void {
  db.prepare('UPDATE counter_sales SET voided_at = ? WHERE id = ?').run(now, id);
}
