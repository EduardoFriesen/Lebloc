import type { Db } from '../db/connection';

export function getSetting(db: Db, key: string): string | undefined {
  return db.prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?').get(key)?.value;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run({ key, value });
}
