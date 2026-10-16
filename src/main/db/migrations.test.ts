import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
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

  it('rejects invalid walk-in sales at the database level', () => {
    const db = openDatabase(':memory:');
    const sale = db.prepare(
      "INSERT INTO counter_sales (kind, price_cents, method, sold_at, recorded_at) VALUES (?, ?, 'cash', '2026-10-11', 'x')",
    );
    sale.run('day_pass', 800_000);
    expect(() => sale.run('day_pass', 0)).toThrow(/CHECK/);
    expect(() => sale.run('locker', 100)).toThrow(/CHECK/);
  });

  it('rejects invalid expenses and shifts at the database level', () => {
    const db = openDatabase(':memory:');
    const expense = db.prepare(
      "INSERT INTO expenses (category, amount_cents, method, paid_at, recorded_at) VALUES (?, ?, 'cash', '2026-10-05', 'x')",
    );
    expense.run('rent', 100);
    expect(() => expense.run('groceries', 100)).toThrow(/CHECK/);
    expect(() => expense.run('rent', 0)).toThrow(/CHECK/);
    db.prepare("INSERT INTO employees (first_name, last_name, kind, hourly_rate_cents) VALUES ('Ana', 'Roca', 'staff', 500)").run();
    expect(() =>
      db.prepare("INSERT INTO employees (first_name, last_name, kind, hourly_rate_cents) VALUES ('Ana', 'Roca', 'boss', 500)").run(),
    ).toThrow(/CHECK/);
    const shift = db.prepare(
      "INSERT INTO work_shifts (employee_id, worked_on, minutes, hourly_rate_cents, cost_cents, recorded_at) VALUES (?, '2026-10-05', ?, 500, 0, 'x')",
    );
    shift.run(1, 60);
    expect(() => shift.run(1, 0)).toThrow(/CHECK/);
    expect(() => shift.run(1, 1441)).toThrow(/CHECK/);
    expect(() => shift.run(99, 60)).toThrow(/FOREIGN KEY/);
  });

  it('keeps the audit log append-only', () => {
    const db = openDatabase(':memory:');
    db.prepare("INSERT INTO audit_log (at, action) VALUES ('2026-10-05T15:00:00.000Z', 'backup_exported')").run();
    expect(() => db.prepare("UPDATE audit_log SET detail = 'otro'").run()).toThrow(/append-only/);
    expect(() => db.prepare('DELETE FROM audit_log').run()).toThrow(/append-only/);
    expect(() => db.prepare("INSERT INTO audit_log (at, action) VALUES ('x', 'client_deleted')").run()).toThrow(/CHECK/);
  });

  it('lets the audit log record imports, keeping earlier entries and the append-only triggers', () => {
    const db = new Database(':memory:');
    MIGRATIONS.slice(0, 7).forEach((sql) => db.exec(sql));
    db.pragma('user_version = 7');
    db.prepare("INSERT INTO audit_log (at, action) VALUES ('2026-10-05T15:00:00.000Z', 'backup_exported')").run();
    migrate(db);
    db.prepare("INSERT INTO audit_log (at, action, detail) VALUES ('2026-10-15T15:00:00.000Z', 'data_imported', '3 clientes')").run();
    expect(db.prepare('SELECT action FROM audit_log ORDER BY id').all()).toEqual([{ action: 'backup_exported' }, { action: 'data_imported' }]);
    expect(() => db.prepare("UPDATE audit_log SET detail = 'otro'").run()).toThrow(/append-only/);
    expect(() => db.prepare('DELETE FROM audit_log').run()).toThrow(/append-only/);
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
