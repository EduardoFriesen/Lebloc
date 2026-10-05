import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { DomainError } from '../domain/errors';
import type { Db } from './db/connection';
import { MIGRATIONS } from './db/migrations';

export const BACKUPS_TO_KEEP = 10;
const BACKUP_FILE = /^lebloc-.+\.db$/;

// The live database runs in WAL mode and the backup copies that flag. Switching the
// copy to rollback journaling makes it a single self-contained file that can be
// opened read-only (validation) or carried on a USB stick.
export async function writeBackupFile(db: Db, file: string): Promise<void> {
  await db.backup(file);
  const copy = new Database(file);
  try {
    copy.pragma('journal_mode = DELETE');
  } finally {
    copy.close();
  }
}

export async function createBackup(db: Db, dir: string, now: Date, keep = BACKUPS_TO_KEEP): Promise<string> {
  await mkdir(dir, { recursive: true });
  const file = join(dir, `lebloc-${now.toISOString().replace(/[:.]/g, '-')}.db`);
  await writeBackupFile(db, file);
  await pruneBackups(dir, keep);
  return file;
}

export async function pruneBackups(dir: string, keep: number): Promise<void> {
  const files = (await readdir(dir)).filter((name) => BACKUP_FILE.test(name)).sort();
  const stale = files.slice(0, Math.max(0, files.length - keep));
  await Promise.all(stale.map((name) => rm(join(dir, name))));
}

export function validateBackupFile(path: string): void {
  let db: Db | undefined;
  try {
    db = new Database(path, { readonly: true, fileMustExist: true });
    const integrity = db.pragma('integrity_check', { simple: true });
    const version = Number(db.pragma('user_version', { simple: true }));
    const hasSales = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sales'").get();
    if (integrity !== 'ok' || version < 1 || version > MIGRATIONS.length || !hasSales) {
      throw new DomainError('INVALID_BACKUP');
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('INVALID_BACKUP');
  } finally {
    db?.close();
  }
}
