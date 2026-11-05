import type { ProductInput } from '../../shared/schemas';
import type { Product } from '../../shared/types';
import type { Db } from '../db/connection';

export type ProductRow = Omit<Product, 'suggestedPriceCents'>;

const COLUMNS = `id, name, description, unit_cost_cents AS unitCostCents, markup_percent AS markupPercent,
  price_cents AS priceCents, active`;

const toRow = (row: Omit<ProductRow, 'active'> & { active: number }): ProductRow => ({ ...row, active: row.active === 1 });

const PARAMS = (p: ProductInput) => ({ ...p, active: p.active ? 1 : 0 });

export function insertProduct(db: Db, p: ProductInput): number {
  const result = db
    .prepare(
      `INSERT INTO products (name, description, unit_cost_cents, markup_percent, price_cents, active)
       VALUES (@name, @description, @unitCostCents, @markupPercent, @priceCents, @active)`,
    )
    .run(PARAMS(p));
  return Number(result.lastInsertRowid);
}

export function updateProductRow(db: Db, id: number, p: ProductInput): void {
  db.prepare(
    `UPDATE products SET name = @name, description = @description, unit_cost_cents = @unitCostCents,
       markup_percent = @markupPercent, price_cents = @priceCents, active = @active WHERE id = @id`,
  ).run({ ...PARAMS(p), id });
}

export function setProductUnitCost(db: Db, id: number, unitCostCents: number): void {
  db.prepare('UPDATE products SET unit_cost_cents = ? WHERE id = ?').run(unitCostCents, id);
}

export function findProduct(db: Db, id: number): ProductRow | undefined {
  const row = db.prepare<[number], Parameters<typeof toRow>[0]>(`SELECT ${COLUMNS} FROM products WHERE id = ?`).get(id);
  return row && toRow(row);
}

export function listProducts(db: Db, includeInactive: boolean): ProductRow[] {
  return db
    .prepare<[number], Parameters<typeof toRow>[0]>(
      `SELECT ${COLUMNS} FROM products WHERE active = 1 OR ? = 1 ORDER BY name COLLATE NOCASE`,
    )
    .all(includeInactive ? 1 : 0)
    .map(toRow);
}

/** Id of the product with this name (case-insensitive), if any. */
export function findProductIdByName(db: Db, name: string): number | undefined {
  return db.prepare<[string], { id: number }>('SELECT id FROM products WHERE name = ? COLLATE NOCASE').get(name)?.id;
}

/** Active products ordered by units sold in non-voided tickets since `since`, then by name. */
export function topProducts(db: Db, since: string, limit: number): ProductRow[] {
  return db
    .prepare<[string, number], Parameters<typeof toRow>[0]>(
      `SELECT ${COLUMNS} FROM products p
       LEFT JOIN (
         SELECT i.product_id, SUM(i.quantity) AS units FROM kiosk_sale_items i
         JOIN kiosk_sales k ON k.id = i.sale_id
         WHERE k.voided_at IS NULL AND k.sold_at >= ? GROUP BY i.product_id
       ) u ON u.product_id = p.id
       WHERE p.active = 1 ORDER BY COALESCE(u.units, 0) DESC, p.name COLLATE NOCASE LIMIT ?`,
    )
    .all(since, limit)
    .map(toRow);
}
