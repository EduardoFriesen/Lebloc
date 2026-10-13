import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBackup } from '../backup';
import { createTestContext, TEST_NOW, type TestContext } from '../test-context';
import { changeBackupMirror, getBackupStatus, mirrorBackup } from './backups';

describe('external backup copy', () => {
  let ctx: TestContext;
  let dir: string;
  let pendrive: string;

  beforeEach(async () => {
    ctx = createTestContext();
    dir = await mkdtemp(join(tmpdir(), 'lebloc-mirror-'));
    pendrive = join(dir, 'pendrive');
    await mkdir(pendrive);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const backupNow = () => createBackup(ctx.db, join(dir, 'backups'), ctx.clock.now());
  const picking = (folder: string | null) => ({ pickFolder: async () => folder, backupNow });

  it('is off until a folder is chosen, and then does nothing', async () => {
    expect(getBackupStatus(ctx)).toEqual({ mirrorDir: null, mirrorAt: null, mirrorError: null });
    expect(await mirrorBackup(ctx, await backupNow())).toBeUndefined();
    expect(getBackupStatus(ctx)).toEqual({ mirrorDir: null, mirrorAt: null, mirrorError: null });
  });

  it('copies right away into the chosen folder and records when', async () => {
    expect(await changeBackupMirror(ctx, 'choose', picking(pendrive))).toEqual({
      mirrorDir: pendrive,
      mirrorAt: TEST_NOW.toISOString(),
      mirrorError: null,
    });
    expect(await readdir(join(pendrive, 'lebloc-backups'))).toHaveLength(1);
  });

  it('keeps the folder when the dialog is cancelled and forgets everything when cleared', async () => {
    await changeBackupMirror(ctx, 'choose', picking(pendrive));
    expect((await changeBackupMirror(ctx, 'choose', picking(null))).mirrorDir).toBe(pendrive);
    expect(await changeBackupMirror(ctx, 'clear', picking(null))).toEqual({ mirrorDir: null, mirrorAt: null, mirrorError: null });
  });

  it('records a failed copy without throwing, and the next good copy clears it', async () => {
    await changeBackupMirror(ctx, 'choose', picking(pendrive));
    await rm(pendrive, { recursive: true });
    const local = await backupNow();

    expect(await mirrorBackup(ctx, local)).toBeInstanceOf(Error);
    expect(existsSync(local)).toBe(true);
    expect(getBackupStatus(ctx)).toEqual({ mirrorDir: pendrive, mirrorAt: TEST_NOW.toISOString(), mirrorError: expect.stringMatching(/pendrive/) });

    await mkdir(pendrive);
    const later = new Date(2026, 9, 5, 18, 0);
    ctx.clock.set(later);
    expect(await mirrorBackup(ctx, await backupNow())).toBeUndefined();
    expect(getBackupStatus(ctx)).toEqual({ mirrorDir: pendrive, mirrorAt: later.toISOString(), mirrorError: null });
  });
});
