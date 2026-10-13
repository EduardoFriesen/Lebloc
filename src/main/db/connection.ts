import Database from 'better-sqlite3';
import { fold } from '../../shared/text';
import { migrate } from './migrations';

export type Db = Database.Database;

export function openDatabase(filename: string): Db {
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // SQLite's LIKE minds accents and only folds ASCII case; searches compare fold(...) on both sides instead.
  db.function('fold', { deterministic: true }, (text: unknown) => (typeof text === 'string' ? fold(text) : text));
  migrate(db);
  return db;
}
