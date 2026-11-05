import type { KioskSaleItem, PaymentMethod } from '../../shared/types';
import type { Db } from '../db/connection';

export interface KioskSaleRow {
  id: number;
  soldAt: string;
  recordedAt: string;
  method: PaymentMethod;
  voidedAt: string | null;
}

export interface NewKioskItem {
  productId: number;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number;
}

const SALE_COLUMNS = 'id, sold_at AS soldAt, recorded_at AS recordedAt, method, voided_at AS voidedAt';

export function insertKioskSale(db: Db, sale: { soldAt: string; recordedAt: string; method: PaymentMethod }): number {
  const result = db
    .prepare('INSERT INTO kiosk_sales (sold_at, recorded_at, method) VALUES (@soldAt, @recordedAt, @method)')
    .run(sale);
  return Number(result.lastInsertRowid);
}

export function insertKioskItem(db: Db, saleId: number, item: NewKioskItem): void {
  db.prepare(
    `INSERT INTO kiosk_sale_items (sale_id, product_id, product_name, quantity, unit_price_cents, unit_cost_cents)
     VALUES (@saleId, @productId, @productName, @quantity, @unitPriceCents, @unitCostCents)`,
  ).run({ ...item, saleId });
}

export function findKioskSale(db: Db, id: number): KioskSaleRow | undefined {
  return db.prepare<[number], KioskSaleRow>(`SELECT ${SALE_COLUMNS} FROM kiosk_sales WHERE id = ?`).get(id);
}

export function listKioskSalesOn(db: Db, date: string): KioskSaleRow[] {
  return db
    .prepare<[string], KioskSaleRow>(`SELECT ${SALE_COLUMNS} FROM kiosk_sales WHERE sold_at = ? ORDER BY id DESC`)
    .all(date);
}

export function listKioskItems(db: Db, saleId: number): KioskSaleItem[] {
  return db
    .prepare<[number], KioskSaleItem>(
      `SELECT id, product_id AS productId, product_name AS productName, quantity,
         unit_price_cents AS unitPriceCents, unit_cost_cents AS unitCostCents
       FROM kiosk_sale_items WHERE sale_id = ? ORDER BY id`,
    )
    .all(saleId);
}

export function voidKioskSale(db: Db, id: number, now: string): void {
  db.prepare('UPDATE kiosk_sales SET voided_at = ? WHERE id = ?').run(now, id);
}
