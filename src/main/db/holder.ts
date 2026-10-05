import { copyFile, rename, rm } from 'node:fs/promises';
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
    // Stage the copy first: the safety backup below prunes the folder and could delete `source`.
    const staged = `${this.path}.restoring`;
    try {
      await copyFile(source, staged);
      await createBackup(this.current, backupDir, now);
    } catch (error) {
      await rm(staged, { force: true });
      throw error;
    }
    this.current.close();
    let failure: unknown;
    try {
      await rm(`${this.path}-wal`, { force: true });
      await rm(`${this.path}-shm`, { force: true });
      await rename(staged, this.path);
    } catch (error) {
      failure = error;
      await rm(staged, { force: true });
    }
    try {
      this.current = openDatabase(this.path);
    } catch (error) {
      throw failure ?? error;
    }
    if (failure) throw failure;
  }
}
