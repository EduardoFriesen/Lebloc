import { access, copyFile, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import Database from 'better-sqlite3';
import { DomainError } from '../domain/errors';
import type { Db } from './db/connection';
import { MIGRATIONS } from './db/migrations';
import { insertAudit } from './repos/audit';

export const BACKUPS_TO_KEEP = 10;
export const BACKUP_DAYS_TO_KEEP = 30;
const BACKUP_FILE = /^lebloc-.+\.db$/;
const MIRROR_FOLDER = 'lebloc-backups';

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

/** "Exportar backup": a full copy of the personal data leaves the app, so it is traced (Ley 25.326). */
export async function exportBackup(db: Db, file: string, now: Date): Promise<void> {
  await writeBackupFile(db, file);
  insertAudit(db, { at: now.toISOString(), action: 'backup_exported', subjectId: null, detail: file });
}

export async function createBackup(db: Db, dir: string, now: Date, keep = BACKUPS_TO_KEEP): Promise<string> {
  await mkdir(dir, { recursive: true });
  const file = join(dir, `lebloc-${now.toISOString().replace(/[:.]/g, '-')}.db`);
  await writeBackupFile(db, file);
  await pruneBackups(dir, keep);
  return file;
}

/**
 * Which backups survive a prune: the newest `latest`, plus the newest of each of the last `days` days that have one, so
 * opening the app many times in a day never wipes the days before. Names carry the UTC timestamp, so they sort by time.
 */
export function backupsToKeep(names: readonly string[], latest: number, days: number): Set<string> {
  const sorted = [...names].sort();
  const newestOfDay = new Map<string, string>();
  for (const name of sorted) newestOfDay.set(name.slice('lebloc-'.length, 'lebloc-'.length + 10), name);
  const lastOfDays = [...newestOfDay.values()];
  return new Set([...sorted.slice(Math.max(0, sorted.length - latest)), ...lastOfDays.slice(Math.max(0, lastOfDays.length - days))]);
}

export async function pruneBackups(dir: string, keep: number): Promise<void> {
  const files = (await readdir(dir)).filter((name) => BACKUP_FILE.test(name));
  const kept = backupsToKeep(files, keep, BACKUP_DAYS_TO_KEEP);
  await Promise.all(files.filter((name) => !kept.has(name)).map((name) => rm(join(dir, name))));
}

/**
 * Copies a backup into `<external folder>/lebloc-backups/`, a folder of its own so pruning never touches the user's
 * files. A missing external folder (an unplugged pendrive) is an error, never recreated on this disk. The copy lands
 * under a temporary name first, so an interrupted copy never looks like a backup.
 */
export async function copyToMirror(file: string, externalDir: string): Promise<void> {
  await access(externalDir);
  const dir = join(externalDir, MIRROR_FOLDER);
  await mkdir(dir, { recursive: true });
  const target = join(dir, basename(file));
  await copyFile(file, `${target}.part`);
  await rename(`${target}.part`, target);
  await pruneBackups(dir, BACKUPS_TO_KEEP);
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
