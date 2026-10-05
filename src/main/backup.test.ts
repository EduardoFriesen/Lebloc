import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { expectDomainError, expectDomainErrorAsync } from '../test/helpers';
import { createBackup, validateBackupFile } from './backup';
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

  it('accepts real backups and rejects anything else', async () => {
    const file = await createBackup(openDatabase(':memory:'), dir, TEST_NOW);
    expect(() => validateBackupFile(file)).not.toThrow();

    const bogus = join(dir, 'notas.db');
    await writeFile(bogus, 'esto no es una base de datos');
    expectDomainError(() => validateBackupFile(bogus), 'INVALID_BACKUP');
    expectDomainError(() => validateBackupFile(join(dir, 'no-existe.db')), 'INVALID_BACKUP');
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
});
