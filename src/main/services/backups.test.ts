import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '../../domain/errors';
import { expectDomainErrorAsync } from '../../test/helpers';
import { createBackup } from '../backup';
import type { Context } from '../context';
import { DatabaseHolder } from '../db/holder';
import { DriveAuthError } from '../drive';
import { listAudit } from '../repos/audit';
import { createTestContext, TEST_NOW, type TestContext } from '../test-context';
import { changeBackupDrive, changeBackupMirror, driveBackup, getBackupStatus, mirrorBackup, restoreKeepingExternal } from './backups';

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
    expect(getBackupStatus(ctx)).toMatchObject({ mirrorDir: null, mirrorAt: null, mirrorError: null });
    expect(await mirrorBackup(ctx, await backupNow())).toBeUndefined();
    expect(getBackupStatus(ctx)).toMatchObject({ mirrorDir: null, mirrorAt: null, mirrorError: null });
  });

  it('copies right away into the chosen folder and records when', async () => {
    expect(await changeBackupMirror(ctx, 'choose', picking(pendrive))).toMatchObject({
      mirrorDir: pendrive,
      mirrorAt: TEST_NOW.toISOString(),
      mirrorError: null,
    });
    expect(await readdir(join(pendrive, 'lebloc-backups'))).toHaveLength(1);
  });

  it('keeps the folder when the dialog is cancelled and forgets everything when cleared', async () => {
    await changeBackupMirror(ctx, 'choose', picking(pendrive));
    expect((await changeBackupMirror(ctx, 'choose', picking(null))).mirrorDir).toBe(pendrive);
    expect(await changeBackupMirror(ctx, 'clear', picking(null))).toMatchObject({ mirrorDir: null, mirrorAt: null, mirrorError: null });
  });

  it('records a failed copy without throwing, and the next good copy clears it', async () => {
    await changeBackupMirror(ctx, 'choose', picking(pendrive));
    await rm(pendrive, { recursive: true });
    const local = await backupNow();

    expect(await mirrorBackup(ctx, local)).toBeInstanceOf(Error);
    expect(existsSync(local)).toBe(true);
    expect(getBackupStatus(ctx)).toMatchObject({ mirrorDir: pendrive, mirrorAt: TEST_NOW.toISOString(), mirrorError: expect.stringMatching(/pendrive/) });

    await mkdir(pendrive);
    const later = new Date(2026, 9, 5, 18, 0);
    ctx.clock.set(later);
    expect(await mirrorBackup(ctx, await backupNow())).toBeUndefined();
    expect(getBackupStatus(ctx)).toMatchObject({ mirrorDir: pendrive, mirrorAt: later.toISOString(), mirrorError: null });
  });

  it("keeps this PC's external folder and Google account when an older backup is restored", async () => {
    const holder = new DatabaseHolder(join(dir, 'lebloc.db'));
    const pc: Context = {
      get db() {
        return holder.db;
      },
      clock: ctx.clock,
    };
    const backups = join(dir, 'backups');
    const backupNow = () => createBackup(holder.db, backups, TEST_NOW);
    // Taken before the folder was chosen and Drive connected, so its settings have neither.
    const older = await createBackup(holder.db, join(dir, 'saved'), TEST_NOW);
    await changeBackupMirror(pc, 'choose', { pickFolder: async () => pendrive, backupNow });
    await changeBackupDrive(pc, 'connect', fakeDrive(backupNow));

    await restoreKeepingExternal(pc, () => holder.restoreFrom(older, backups, TEST_NOW));

    expect(getBackupStatus(pc)).toEqual({
      mirrorDir: pendrive,
      mirrorAt: TEST_NOW.toISOString(),
      mirrorError: null,
      driveEmail: 'local@gmail.com',
      driveAt: TEST_NOW.toISOString(),
      driveError: null,
    });
    holder.close();
  });
});

/** A Google account that signs in as local@gmail.com and keeps what is uploaded, unless told to fail. */
function fakeDrive(backupNow: () => Promise<string>) {
  return {
    uploaded: [] as string[],
    failure: null as Error | null,
    signIn: null as Error | null,
    disconnected: false,
    backupNow,
    async connectDrive() {
      if (this.signIn) throw this.signIn;
      return 'local@gmail.com';
    },
    async disconnectDrive() {
      this.disconnected = true;
    },
    async uploadToDrive(file: string) {
      if (this.failure) throw this.failure;
      this.uploaded.push(file);
    },
  };
}

describe('Google Drive copy', () => {
  let ctx: TestContext;
  let dir: string;
  let drive: ReturnType<typeof fakeDrive>;

  beforeEach(async () => {
    ctx = createTestContext();
    dir = await mkdtemp(join(tmpdir(), 'lebloc-drive-'));
    drive = fakeDrive(() => createBackup(ctx.db, join(dir, 'backups'), ctx.clock.now()));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('is off until an account is connected, and then uploads nothing', async () => {
    expect(getBackupStatus(ctx)).toMatchObject({ driveEmail: null, driveAt: null, driveError: null });
    expect(await driveBackup(ctx, await drive.backupNow(), drive)).toBeUndefined();
    expect(drive.uploaded).toEqual([]);
  });

  it('connecting records the account, traces it and uploads right away', async () => {
    expect(await changeBackupDrive(ctx, 'connect', drive)).toMatchObject({
      driveEmail: 'local@gmail.com',
      driveAt: TEST_NOW.toISOString(),
      driveError: null,
    });
    expect(drive.uploaded).toHaveLength(1);
    expect(listAudit(ctx.db)).toMatchObject([{ action: 'drive_connected', detail: 'local@gmail.com' }]);
  });

  it('a sign-in that does not finish changes nothing', async () => {
    drive.signIn = new DomainError('DRIVE_CONNECT_FAILED');
    await expectDomainErrorAsync(() => changeBackupDrive(ctx, 'connect', drive), 'DRIVE_CONNECT_FAILED');
    expect(getBackupStatus(ctx)).toMatchObject({ driveEmail: null, driveAt: null, driveError: null });
    expect(listAudit(ctx.db)).toEqual([]);
  });

  it('records a failed upload without throwing, and the next good upload clears it', async () => {
    await changeBackupDrive(ctx, 'connect', drive);
    drive.failure = new Error('getaddrinfo ENOTFOUND www.googleapis.com');

    expect(await driveBackup(ctx, await drive.backupNow(), drive)).toBe(drive.failure);
    expect(getBackupStatus(ctx)).toMatchObject({ driveAt: TEST_NOW.toISOString(), driveError: expect.stringMatching(/internet/) });

    drive.failure = null;
    const later = new Date(2026, 9, 5, 18, 0);
    ctx.clock.set(later);
    expect(await driveBackup(ctx, await drive.backupNow(), drive)).toBeUndefined();
    expect(getBackupStatus(ctx)).toMatchObject({ driveAt: later.toISOString(), driveError: null });
  });

  it('asks to connect the account again when Google revoked the access', async () => {
    await changeBackupDrive(ctx, 'connect', drive);
    drive.failure = new DriveAuthError();
    await driveBackup(ctx, await drive.backupNow(), drive);
    expect(getBackupStatus(ctx).driveError).toMatch(/Volvé a conectar/);
  });

  it('disconnecting forgets the account and traces it', async () => {
    await changeBackupDrive(ctx, 'connect', drive);
    expect(await changeBackupDrive(ctx, 'disconnect', drive)).toMatchObject({ driveEmail: null, driveAt: null, driveError: null });
    expect(drive.disconnected).toBe(true);
    expect(listAudit(ctx.db)[0]).toMatchObject({ action: 'drive_disconnected', detail: 'local@gmail.com' });
  });
});
