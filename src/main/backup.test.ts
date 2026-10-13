import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { expectDomainError, expectDomainErrorAsync } from '../test/helpers';
import { BACKUPS_TO_KEEP, backupsToKeep, copyToMirror, createBackup, exportBackup, validateBackupFile } from './backup';
import type { Context } from './context';
import { openDatabase } from './db/connection';
import { DatabaseHolder } from './db/holder';
import { createPlan, listPlans } from './services/plans';
import { freePlan, TEST_NOW } from './test-context';

describe('backups', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'lebloc-backup-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function holderContext(holder: DatabaseHolder): Context {
    return {
      get db() {
        return holder.db;
      },
      clock: { now: () => TEST_NOW },
    };
  }

  it('writes timestamped backups and keeps only the newest ones', async () => {
    const db = openDatabase(':memory:');
    const backups = join(dir, 'backups');
    for (let minute = 0; minute < 4; minute += 1) {
      await createBackup(db, backups, new Date(Date.UTC(2026, 9, 5, 12, minute)), 3);
    }
    const files = (await readdir(backups)).sort();
    expect(files).toHaveLength(3);
    expect(files[0]).toContain('T12-01');
  });

  it('keeps the newest backups plus the last one of each recent day', () => {
    const names = [
      'lebloc-2026-10-01T10-00-00-000Z.db',
      'lebloc-2026-10-01T20-00-00-000Z.db',
      'lebloc-2026-10-02T09-00-00-000Z.db',
      'lebloc-2026-10-03T09-00-00-000Z.db',
      'lebloc-2026-10-03T10-00-00-000Z.db',
      'lebloc-2026-10-03T11-00-00-000Z.db',
    ];
    expect([...backupsToKeep(names, 2, 2)].sort()).toEqual([
      'lebloc-2026-10-02T09-00-00-000Z.db',
      'lebloc-2026-10-03T10-00-00-000Z.db',
      'lebloc-2026-10-03T11-00-00-000Z.db',
    ]);
    expect(backupsToKeep(names, 0, 0).size).toBe(0);
  });

  it("keeps yesterday's backup however many times the app opens today", async () => {
    const db = openDatabase(':memory:');
    const backups = join(dir, 'backups');
    const yesterday = await createBackup(db, backups, new Date(Date.UTC(2026, 9, 4, 20, 0)));
    for (let minute = 0; minute < 12; minute += 1) {
      await createBackup(db, backups, new Date(Date.UTC(2026, 9, 5, 12, minute)));
    }
    const files = await readdir(backups);
    expect(files).toHaveLength(BACKUPS_TO_KEEP + 1);
    expect(files).toContain(basename(yesterday));
  });

  it('copies into its own folder inside the external one and prunes only there', async () => {
    const db = openDatabase(':memory:');
    const pendrive = join(dir, 'pendrive');
    await mkdir(pendrive);
    await writeFile(join(pendrive, 'lebloc-2020-01-01.db'), 'una exportación a mano');
    for (let minute = 0; minute < 12; minute += 1) {
      await copyToMirror(await createBackup(db, join(dir, 'backups'), new Date(Date.UTC(2026, 9, 5, 12, minute))), pendrive);
    }
    expect((await readdir(pendrive)).sort()).toEqual(['lebloc-2020-01-01.db', 'lebloc-backups']);
    const copies = await readdir(join(pendrive, 'lebloc-backups'));
    expect(copies).toHaveLength(BACKUPS_TO_KEEP);
    expect(() => validateBackupFile(join(pendrive, 'lebloc-backups', copies[0] ?? ''))).not.toThrow();
  });

  it('refuses a missing external folder instead of creating it on this disk', async () => {
    const file = await createBackup(openDatabase(':memory:'), join(dir, 'backups'), TEST_NOW);
    const unplugged = join(dir, 'pendrive-desenchufado');
    await expect(copyToMirror(file, unplugged)).rejects.toThrow();
    expect(existsSync(unplugged)).toBe(false);
  });

  it('accepts real backups and rejects anything else', async () => {
    const file = await createBackup(openDatabase(':memory:'), dir, TEST_NOW);
    expect(() => validateBackupFile(file)).not.toThrow();

    const bogus = join(dir, 'notas.db');
    await writeFile(bogus, 'esto no es una base de datos');
    expectDomainError(() => validateBackupFile(bogus), 'INVALID_BACKUP');
    expectDomainError(() => validateBackupFile(join(dir, 'no-existe.db')), 'INVALID_BACKUP');
  });

  it('traces each export with the file it went to', async () => {
    const db = openDatabase(':memory:');
    const file = join(dir, 'pendrive.db');
    await exportBackup(db, file, TEST_NOW);
    expect(() => validateBackupFile(file)).not.toThrow();
    expect(db.prepare('SELECT at, action, detail FROM audit_log').all()).toEqual([
      { at: TEST_NOW.toISOString(), action: 'backup_exported', detail: file },
    ]);
  });

  it('traces a restore in the restored database', async () => {
    const holder = new DatabaseHolder(join(dir, 'lebloc.db'));
    const saved = await createBackup(holder.db, join(dir, 'saved'), new Date(Date.UTC(2026, 9, 5, 12)));
    const restoredAt = new Date(Date.UTC(2026, 9, 5, 13));

    await holder.restoreFrom(saved, join(dir, 'backups'), restoredAt);

    expect(holder.db.prepare('SELECT at, action, detail FROM audit_log').all()).toEqual([
      { at: restoredAt.toISOString(), action: 'backup_restored', detail: saved },
    ]);
    holder.close();
  });

  it('restores a backup after saving a safety copy of the current data', async () => {
    const holder = new DatabaseHolder(join(dir, 'lebloc.db'));
    const ctx = holderContext(holder);
    createPlan(ctx, freePlan);
    const saved = await createBackup(holder.db, join(dir, 'saved'), new Date(Date.UTC(2026, 9, 5, 12)));
    createPlan(ctx, { ...freePlan, name: 'Otro plan' });

    await holder.restoreFrom(saved, join(dir, 'backups'), new Date(Date.UTC(2026, 9, 5, 13)));

    expect(listPlans(ctx, true).map((plan) => plan.name)).toEqual(['Pack 8 libres']);
    expect(await readdir(join(dir, 'backups'))).toHaveLength(1);
    holder.close();
  });

  it('restores the oldest backup of a full folder without pruning it away first', async () => {
    const holder = new DatabaseHolder(join(dir, 'lebloc.db'));
    const ctx = holderContext(holder);
    const backups = join(dir, 'backups');
    createPlan(ctx, freePlan);
    const oldest = await createBackup(holder.db, backups, new Date(Date.UTC(2026, 9, 5, 12, 0)));
    createPlan(ctx, { ...freePlan, name: 'Otro plan' });
    for (let minute = 1; minute < BACKUPS_TO_KEEP; minute += 1) {
      await createBackup(holder.db, backups, new Date(Date.UTC(2026, 9, 5, 12, minute)));
    }
    expect(await readdir(backups)).toHaveLength(BACKUPS_TO_KEEP);

    await holder.restoreFrom(oldest, backups, new Date(Date.UTC(2026, 9, 5, 13)));

    expect(listPlans(ctx, true).map((plan) => plan.name)).toEqual(['Pack 8 libres']);
    expect(await readdir(dirname(holder.db.name))).not.toContain('lebloc.db.restoring');
    holder.close();
  });

  it('rejects an invalid file and leaves the current database open and intact', async () => {
    const holder = new DatabaseHolder(join(dir, 'lebloc.db'));
    const ctx = holderContext(holder);
    createPlan(ctx, freePlan);
    const bogus = join(dir, 'notas.db');
    await writeFile(bogus, 'esto no es una base de datos');

    await expectDomainErrorAsync(() => holder.restoreFrom(bogus, join(dir, 'backups'), TEST_NOW), 'INVALID_BACKUP');

    expect(listPlans(ctx, true)).toHaveLength(1);
    holder.close();
  });

  it('rejects a second restore while one is running and keeps the first intact', async () => {
    const holder = new DatabaseHolder(join(dir, 'lebloc.db'));
    const ctx = holderContext(holder);
    createPlan(ctx, freePlan);
    const saved = await createBackup(holder.db, join(dir, 'saved'), new Date(Date.UTC(2026, 9, 5, 12)));
    createPlan(ctx, { ...freePlan, name: 'Otro plan' });
    const backups = join(dir, 'backups');

    const first = holder.restoreFrom(saved, backups, new Date(Date.UTC(2026, 9, 5, 13)));
    const second = holder.restoreFrom(saved, backups, new Date(Date.UTC(2026, 9, 5, 14)));

    await expectDomainErrorAsync(() => second, 'RESTORE_IN_PROGRESS');
    await first;
    expect(listPlans(ctx, true).map((plan) => plan.name)).toEqual(['Pack 8 libres']);
    await holder.restoreFrom(saved, backups, new Date(Date.UTC(2026, 9, 5, 15)));
    holder.close();
  });
});
