import type { BackupStatus } from '../../shared/types';
import { copyToMirror } from '../backup';
import { type Context, nowIso } from '../context';
import { deleteSetting, getSetting, setSetting } from '../repos/settings';

const MIRROR_DIR = 'backup_mirror_dir';
const MIRROR_AT = 'backup_mirror_at';
const MIRROR_ERROR = 'backup_mirror_error';
const MIRROR_FAILED = 'No se pudo copiar el backup a la carpeta externa. Revisá que el pendrive esté conectado o que la carpeta exista.';

export interface MirrorOps {
  /** The native folder dialog; null when it is cancelled. The path never comes from the page. */
  pickFolder(): Promise<string | null>;
  /** A fresh local backup; returns its file. */
  backupNow(): Promise<string>;
}

export function getBackupStatus(ctx: Context): BackupStatus {
  return {
    mirrorDir: getSetting(ctx.db, MIRROR_DIR) ?? null,
    mirrorAt: getSetting(ctx.db, MIRROR_AT) ?? null,
    mirrorError: getSetting(ctx.db, MIRROR_ERROR) ?? null,
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

/**
 * The external folder belongs to this PC, not to the data, but it is stored with the data: restoring a backup would
 * bring back that backup's folder (often none) and silently stop the copies. This keeps the current one and its status.
 */
export async function restoreKeepingMirror(ctx: Context, restore: () => Promise<void>): Promise<void> {
  const kept = [MIRROR_DIR, MIRROR_AT, MIRROR_ERROR].map((key) => [key, getSetting(ctx.db, key)] as const);
  await restore();
  ctx.db.transaction(() => {
    for (const [key, value] of kept) {
      if (value === undefined) deleteSetting(ctx.db, key);
      else setSetting(ctx.db, key, value);
    }
  })();
}
