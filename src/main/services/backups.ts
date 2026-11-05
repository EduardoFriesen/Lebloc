import type { BackupStatus } from '../../shared/types';
import { copyToMirror } from '../backup';
import { type Context, nowIso } from '../context';
import { DriveAuthError } from '../drive';
import { insertAudit } from '../repos/audit';
import { deleteSetting, getSetting, setSetting } from '../repos/settings';

const MIRROR_DIR = 'backup_mirror_dir';
const MIRROR_AT = 'backup_mirror_at';
const MIRROR_ERROR = 'backup_mirror_error';
const MIRROR_FAILED = 'No se pudo copiar el backup a la carpeta externa. Revisá que el pendrive esté conectado o que la carpeta exista.';
const DRIVE_EMAIL = 'backup_drive_email';
const DRIVE_AT = 'backup_drive_at';
const DRIVE_ERROR = 'backup_drive_error';
const DRIVE_FAILED = 'No se pudo subir el backup a Google Drive. Revisá la conexión a internet.';
const DRIVE_REVOKED = 'Se perdió el acceso a Google Drive. Volvé a conectar la cuenta.';

export interface MirrorOps {
  /** The native folder dialog; null when it is cancelled. The path never comes from the page. */
  pickFolder(): Promise<string | null>;
  /** A fresh local backup; returns its file. */
  backupNow(): Promise<string>;
}

/** The Google account side, kept on this PC: its token never goes into the database, so never into a backup. */
export interface DriveOps extends Pick<MirrorOps, 'backupNow'> {
  /** Signs in in the browser and keeps the token; returns the account's email. */
  connectDrive(): Promise<string>;
  /** Revokes the token and forgets it. */
  disconnectDrive(): Promise<void>;
  uploadToDrive(file: string): Promise<void>;
}

export function getBackupStatus(ctx: Context): BackupStatus {
  return {
    mirrorDir: getSetting(ctx.db, MIRROR_DIR) ?? null,
    mirrorAt: getSetting(ctx.db, MIRROR_AT) ?? null,
    mirrorError: getSetting(ctx.db, MIRROR_ERROR) ?? null,
    driveEmail: getSetting(ctx.db, DRIVE_EMAIL) ?? null,
    driveAt: getSetting(ctx.db, DRIVE_AT) ?? null,
    driveError: getSetting(ctx.db, DRIVE_ERROR) ?? null,
  };
}

/**
 * Copies a fresh local backup to the external folder, if there is one, and records how it went. Never throws: an
 * unplugged pendrive must not stop the app. Returns the error, for the caller's log, when the copy failed.
 */
export async function mirrorBackup(ctx: Context, file: string): Promise<unknown> {
  const dir = getSetting(ctx.db, MIRROR_DIR);
  if (!dir) return undefined;
  try {
    await copyToMirror(file, dir);
  } catch (error) {
    setSetting(ctx.db, MIRROR_ERROR, MIRROR_FAILED);
    return error;
  }
  setSetting(ctx.db, MIRROR_AT, nowIso(ctx));
  deleteSetting(ctx.db, MIRROR_ERROR);
  return undefined;
}

/** Points the external copy at a new folder (and copies right away, to show it works) or turns it off. */
export async function changeBackupMirror(ctx: Context, action: 'choose' | 'clear', ops: MirrorOps): Promise<BackupStatus> {
  const dir = action === 'choose' ? await ops.pickFolder() : null;
  if (action === 'choose' && dir === null) return getBackupStatus(ctx);
  ctx.db.transaction(() => {
    deleteSetting(ctx.db, MIRROR_AT);
    deleteSetting(ctx.db, MIRROR_ERROR);
    if (dir) setSetting(ctx.db, MIRROR_DIR, dir);
    else deleteSetting(ctx.db, MIRROR_DIR);
  })();
  if (dir) await mirrorBackup(ctx, await ops.backupNow());
  return getBackupStatus(ctx);
}

/** Uploads a fresh local backup to Google Drive, if an account is connected. Never throws, like `mirrorBackup`. */
export async function driveBackup(ctx: Context, file: string, ops: Pick<DriveOps, 'uploadToDrive'>): Promise<unknown> {
  if (!getSetting(ctx.db, DRIVE_EMAIL)) return undefined;
  try {
    await ops.uploadToDrive(file);
  } catch (error) {
    setSetting(ctx.db, DRIVE_ERROR, error instanceof DriveAuthError ? DRIVE_REVOKED : DRIVE_FAILED);
    return error;
  }
  setSetting(ctx.db, DRIVE_AT, nowIso(ctx));
  deleteSetting(ctx.db, DRIVE_ERROR);
  return undefined;
}

/**
 * Connects a Google account (or connects it again, after Google revoked the access) and uploads right away, to show
 * it works; or disconnects it. Both are traced: while connected, every backup sends all the data out of the PC.
 */
export async function changeBackupDrive(ctx: Context, action: 'connect' | 'disconnect', ops: DriveOps): Promise<BackupStatus> {
  const connected = getSetting(ctx.db, DRIVE_EMAIL);
  const email = action === 'connect' ? await ops.connectDrive() : null;
  if (action === 'disconnect') await ops.disconnectDrive();
  ctx.db.transaction(() => {
    deleteSetting(ctx.db, DRIVE_AT);
    deleteSetting(ctx.db, DRIVE_ERROR);
    if (email) {
      setSetting(ctx.db, DRIVE_EMAIL, email);
      insertAudit(ctx.db, { at: nowIso(ctx), action: 'drive_connected', subjectId: null, detail: email });
    } else if (connected) {
      deleteSetting(ctx.db, DRIVE_EMAIL);
      insertAudit(ctx.db, { at: nowIso(ctx), action: 'drive_disconnected', subjectId: null, detail: connected });
    }
  })();
  if (email) await driveBackup(ctx, await ops.backupNow(), ops);
  return getBackupStatus(ctx);
}

/**
 * The external folder and the Google account belong to this PC, not to the data, but their settings are stored with
 * the data: restoring a backup would bring back that backup's (often none) and silently stop the copies. This keeps
 * the current ones and their status.
 */
export async function restoreKeepingExternal(ctx: Context, restore: () => Promise<void>): Promise<void> {
  const kept = [MIRROR_DIR, MIRROR_AT, MIRROR_ERROR, DRIVE_EMAIL, DRIVE_AT, DRIVE_ERROR].map((key) => [key, getSetting(ctx.db, key)] as const);
  await restore();
  ctx.db.transaction(() => {
    for (const [key, value] of kept) {
      if (value === undefined) deleteSetting(ctx.db, key);
      else setSetting(ctx.db, key, value);
    }
  })();
}
