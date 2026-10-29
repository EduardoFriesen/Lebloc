import type { PaymentMethod } from '../../shared/types';
import type { Db } from '../db/connection';
import { monthBounds } from './expenses';

export interface PurchaseRow {
  id: number;
  paidAt: string;
  method: PaymentMethod;
  recordedAt: string;
  voidedAt: string | null;
}

export interface PurchaseItemRow {
  productId: number;
  productName: string;
  quantity: number;
  costCents: number;
}

const COLUMNS = 'id, paid_at AS paidAt, method, recorded_at AS recordedAt, voided_at AS voidedAt';

export function insertPurchase(db: Db, purchase: { paidAt: string; method: PaymentMethod; recordedAt: string }): number {
  const result = db
    .prepare('INSERT INTO kiosk_purchases (paid_at, method, recorded_at) VALUES (@paidAt, @method, @recordedAt)')
    .run(purchase);
  return Number(result.lastInsertRowid);
}

export function insertPurchaseItem(db: Db, purchaseId: number, item: PurchaseItemRow): void {
  db.prepare(
    `INSERT INTO kiosk_purchase_items (purchase_id, product_id, product_name, quantity, cost_cents)
     VALUES (@purchaseId, @productId, @productName, @quantity, @costCents)`,
  ).run({ ...item, purchaseId });
}

export function findPurchase(db: Db, id: number): PurchaseRow | undefined {
  return db.prepare<[number], PurchaseRow>(`SELECT ${COLUMNS} FROM kiosk_purchases WHERE id = ?`).get(id);
}

export function listPurchaseItems(db: Db, purchaseId: number): PurchaseItemRow[] {
  return db
    .prepare<[number], PurchaseItemRow>(
      `SELECT product_id AS productId, product_name AS productName, quantity, cost_cents AS costCents
       FROM kiosk_purchase_items WHERE purchase_id = ? ORDER BY id`,
    )
    .all(purchaseId);
}

export function listPurchasesInMonth(db: Db, month: string): PurchaseRow[] {
  return db
    .prepare<[{ from: string; to: string }], PurchaseRow>(
      `SELECT ${COLUMNS} FROM kiosk_purchases WHERE paid_at BETWEEN @from AND @to ORDER BY paid_at DESC, id DESC`,
    )
    .all(monthBounds(month));
}

export function voidPurchaseRow(db: Db, id: number, now: string): void {
  db.prepare('UPDATE kiosk_purchases SET voided_at = ? WHERE id = ?').run(now, id);
}
