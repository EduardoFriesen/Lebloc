import type { ProductInput } from '../../shared/schemas';
import type { Db } from '../db/connection';

export interface ProductRow {
  id: number;
  name: string;
  packSize: number;
  packCostCents: number;
  markupPercent: number;
  priceCents: number;
  active: boolean;
}

const COLUMNS = `id, name, pack_size AS packSize, pack_cost_cents AS packCostCents, markup_percent AS markupPercent,
  price_cents AS priceCents, active`;

const toRow = (row: Omit<ProductRow, 'active'> & { active: number }): ProductRow => ({ ...row, active: row.active === 1 });

const PARAMS = (p: ProductInput) => ({ ...p, active: p.active ? 1 : 0 });

export function insertProduct(db: Db, p: ProductInput): number {
  const result = db
    .prepare(
      `INSERT INTO products (name, pack_size, pack_cost_cents, markup_percent, price_cents, active)
       VALUES (@name, @packSize, @packCostCents, @markupPercent, @priceCents, @active)`,
    )
    .run(PARAMS(p));
  return Number(result.lastInsertRowid);
}

export function updateProductRow(db: Db, id: number, p: ProductInput): void {
  db.prepare(
    `UPDATE products SET name = @name, pack_size = @packSize, pack_cost_cents = @packCostCents,
       markup_percent = @markupPercent, price_cents = @priceCents, active = @active WHERE id = @id`,
  ).run({ ...PARAMS(p), id });
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
