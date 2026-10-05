import { copyFile, rm } from 'node:fs/promises';
import { createBackup, validateBackupFile } from '../backup';
import { type Db, openDatabase } from './connection';

// Owns the open database so a restore can swap the underlying file.
// Services must read `ctx.db` on every call instead of caching it.
export class DatabaseHolder {
  private readonly path: string;
  private current: Db;

  constructor(path: string) {
    this.path = path;
    this.current = openDatabase(path);
  }

  get db(): Db {
    return this.current;
  }

  close(): void {
    if (this.current.open) this.current.close();
  }

  async restoreFrom(source: string, backupDir: string, now: Date): Promise<void> {
    validateBackupFile(source);
    await createBackup(this.current, backupDir, now);
    this.current.close();
    try {
      await rm(`${this.path}-wal`, { force: true });
      await rm(`${this.path}-shm`, { force: true });
      await copyFile(source, this.path);
    } finally {
      this.current = openDatabase(this.path);
    }
  }
}
