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
