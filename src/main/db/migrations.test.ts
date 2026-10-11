import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from './connection';
import { MIGRATIONS, migrate } from './migrations';

describe('migrations', () => {
  it('applies every migration and records the version', () => {
    const db = openDatabase(':memory:');
    expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length);
  });

  it('can reopen an existing file without reapplying migrations', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lebloc-db-'));
    try {
      const file = join(dir, 'lebloc.db');
      openDatabase(file).close();
      const reopened = openDatabase(file);
      expect(reopened.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length);
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('enforces foreign keys', () => {
    const db = openDatabase(':memory:');
    expect(() =>
      db.prepare("INSERT INTO guardians (client_id, first_name, last_name) VALUES (999, 'Laura', 'Roca')").run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it('rejects plans without passes at the database level', () => {
    const db = openDatabase(':memory:');
    expect(() =>
      db.prepare("INSERT INTO plans (name, free_passes, teacher_passes, price_cents) VALUES ('Vacío', 0, 0, 100)").run(),
    ).toThrow(/CHECK/);
  });

  it('rejects invalid kiosk rows at the database level', () => {
    const db = openDatabase(':memory:');
    const product = db.prepare(
      'INSERT INTO products (name, pack_size, pack_cost_cents, markup_percent, price_cents) VALUES (?, ?, ?, ?, ?)',
    );
    expect(() => product.run('Agua', 0, 1000, 40, 100)).toThrow(/CHECK/);
    expect(() => product.run('Agua', 12, 1000, 1001, 100)).toThrow(/CHECK/);
    product.run('Agua', 12, 1000, 40, 100);
    expect(() => product.run('AGUA', 6, 500, 40, 100)).toThrow(/UNIQUE/);
    db.prepare("INSERT INTO kiosk_sales (sold_at, recorded_at, method) VALUES ('2026-10-11', 'x', 'cash')").run();
    expect(() =>
      db.prepare("INSERT INTO kiosk_sales (sold_at, recorded_at, method) VALUES ('2026-10-11', 'x', 'card')").run(),
    ).toThrow(/CHECK/);
    expect(() =>
      db
        .prepare(
          `INSERT INTO kiosk_sale_items (sale_id, product_id, product_name, quantity, unit_price_cents, unit_cost_cents)
           VALUES (1, 1, 'Agua', 0, 100, 80)`,
        )
        .run(),
    ).toThrow(/CHECK/);
  });

  it('seeds the low passes threshold', () => {
    const db = openDatabase(':memory:');
    expect(db.prepare("SELECT value FROM settings WHERE key = 'low_passes_threshold'").get()).toEqual({ value: '2' });
  });

  it('refuses a database created by a newer app version', () => {
    const db = openDatabase(':memory:');
    db.pragma('user_version = 99');
    expect(() => migrate(db)).toThrow(/newer/);
  });
});
