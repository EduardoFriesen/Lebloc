import type { KioskPurchasePayment, PaymentMethod } from '../../shared/types';
import type { Db } from '../db/connection';
import { monthBounds } from './expenses';

export interface PurchaseRow {
  id: number;
  receivedAt: string;
  recordedAt: string;
  voidedAt: string | null;
}

export interface PurchaseItemRow {
  productId: number;
  productName: string;
  quantity: number;
  costCents: number;
}

const COLUMNS = 'id, received_at AS receivedAt, recorded_at AS recordedAt, voided_at AS voidedAt';
const PAYMENT_COLUMNS = 'id, purchase_id AS purchaseId, paid_at AS paidAt, amount_cents AS amountCents, method, voided_at AS voidedAt';

export function insertPurchase(db: Db, purchase: { receivedAt: string; recordedAt: string }): number {
  const result = db.prepare('INSERT INTO kiosk_purchases (received_at, recorded_at) VALUES (@receivedAt, @recordedAt)').run(purchase);
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
      `SELECT ${COLUMNS} FROM kiosk_purchases WHERE received_at BETWEEN @from AND @to ORDER BY received_at DESC, id DESC`,
    )
    .all(monthBounds(month));
}

/** Every non-voided delivery, newest first. */
export function listActivePurchases(db: Db): PurchaseRow[] {
  return db.prepare<[], PurchaseRow>(`SELECT ${COLUMNS} FROM kiosk_purchases WHERE voided_at IS NULL ORDER BY received_at DESC, id DESC`).all();
}

export function updatePurchaseRow(db: Db, id: number, receivedAt: string): void {
  db.prepare('UPDATE kiosk_purchases SET received_at = ? WHERE id = ?').run(receivedAt, id);
}

export function deletePurchaseItems(db: Db, purchaseId: number): void {
  db.prepare('DELETE FROM kiosk_purchase_items WHERE purchase_id = ?').run(purchaseId);
}

/** The newest non-voided delivery that brought the product (by date, then by load order). */
export function latestActivePurchaseWith(db: Db, productId: number): number | undefined {
  return db
    .prepare<[number], { id: number }>(
      `SELECT p.id FROM kiosk_purchases p JOIN kiosk_purchase_items i ON i.purchase_id = p.id
       WHERE i.product_id = ? AND p.voided_at IS NULL ORDER BY p.received_at DESC, p.id DESC LIMIT 1`,
    )
    .get(productId)?.id;
}

export function voidPurchaseRow(db: Db, id: number, now: string): void {
  db.prepare('UPDATE kiosk_purchases SET voided_at = ? WHERE id = ?').run(now, id);
}

export function insertPurchasePayment(
  db: Db,
  payment: { purchaseId: number; paidAt: string; amountCents: number; method: PaymentMethod; recordedAt: string },
): number {
  const result = db
    .prepare(
      `INSERT INTO kiosk_purchase_payments (purchase_id, paid_at, amount_cents, method, recorded_at)
       VALUES (@purchaseId, @paidAt, @amountCents, @method, @recordedAt)`,
    )
    .run(payment);
  return Number(result.lastInsertRowid);
}

export function findPurchasePayment(db: Db, id: number): KioskPurchasePayment | undefined {
  return db.prepare<[number], KioskPurchasePayment>(`SELECT ${PAYMENT_COLUMNS} FROM kiosk_purchase_payments WHERE id = ?`).get(id);
}

export function listPurchasePayments(db: Db, purchaseId: number): KioskPurchasePayment[] {
  return db
    .prepare<[number], KioskPurchasePayment>(`SELECT ${PAYMENT_COLUMNS} FROM kiosk_purchase_payments WHERE purchase_id = ? ORDER BY paid_at, id`)
    .all(purchaseId);
}

export function voidPurchasePaymentRow(db: Db, id: number, now: string): void {
  db.prepare('UPDATE kiosk_purchase_payments SET voided_at = ? WHERE id = ?').run(now, id);
}
