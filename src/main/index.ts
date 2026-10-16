import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, type OpenDialogOptions, safeStorage, type SaveDialogOptions, shell } from 'electron';
import log from 'electron-log/main';
import { toIsoDate } from '../domain/dates';
import { DomainError } from '../domain/errors';
import { createBackup, exportBackup } from './backup';
import { type Context, systemClock } from './context';
import { DatabaseHolder } from './db/holder';
import { accessToken, accountEmail, authorize, DriveAuthError, type GoogleClient, revoke, uploadBackup } from './drive';
import { type BackupOps, createHandlers } from './ipc/handlers';
import { registerIpc } from './ipc/register';
import { driveBackup, type DriveOps, mirrorBackup, restoreKeepingExternal } from './services/backups';

// E2E tests point userData at a temp dir so they never touch real data.
if (process.env.LEBLOC_USER_DATA) app.setPath('userData', process.env.LEBLOC_USER_DATA);

const BACKUP_FILTERS = [{ name: 'Base de datos de Lebloc', extensions: ['db'] }];
const SPREADSHEET_FILTERS = [{ name: 'Planilla', extensions: ['xlsx'] }];
// Closing waits this long at most for the last backup and its copies out of the PC. An upload cut short leaves nothing
// in Drive, and the next opening uploads again.
const QUIT_BACKUP_CAP_MS = 15_000;

// Exact page the app loads; the only sender IPC trusts.
const APP_URL = process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(join(__dirname, '../renderer/index.html')).href;

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'Lebloc',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // The app uses HashRouter and never navigates, so any navigation is hostile (e.g. a dropped file).
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
  mainWindow = win;
  win.on('closed', () => {
    mainWindow = null;
  });
  return win;
}

// Dialogs are modal to the main window so no second backup action can start while one is open.
function showSave(options: SaveDialogOptions) {
  return mainWindow ? dialog.showSaveDialog(mainWindow, options) : dialog.showSaveDialog(options);
}

function showOpen(options: OpenDialogOptions) {
  return mainWindow ? dialog.showOpenDialog(mainWindow, options) : dialog.showOpenDialog(options);
}

/** Lebloc's OAuth client, from the build. Without it, or without a way to encrypt the token, there is no Drive. */
function googleClient(): GoogleClient {
  const id = import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID;
  const secret = import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET;
  if (!id || !secret || !safeStorage.isEncryptionAvailable()) throw new DomainError('DRIVE_UNAVAILABLE');
  return { id, secret };
}

/**
 * The refresh token lives in its own file, encrypted for this Windows user (DPAPI): outside the database, so it never
 * travels inside a backup, not even the ones uploaded to Drive.
 */
function createDriveOps(tokenFile: string): Omit<DriveOps, 'backupNow'> {
  const readToken = async () => {
    try {
      return safeStorage.decryptString(await readFile(tokenFile));
    } catch {
      throw new DriveAuthError();
    }
  };
  return {
    async connectDrive() {
      const client = googleClient();
      const refreshToken = await authorize(client, (url) => shell.openExternal(url));
      const email = await accountEmail(await accessToken(client, refreshToken));
      await writeFile(tokenFile, safeStorage.encryptString(refreshToken));
      return email;
    },
    async disconnectDrive() {
      const token = await readToken().catch(() => null);
      if (token) await revoke(token);
      await rm(tokenFile, { force: true });
    },
    async uploadToDrive(file) {
      const client = googleClient();
      await uploadBackup(await accessToken(client, await readToken()), file);
    },
  };
}

function createBackupOps(ctx: Context, holder: DatabaseHolder, backupDir: string, tokenFile: string): BackupOps {
  return {
    ...createDriveOps(tokenFile),
    async exportBackup() {
      const result = await showSave({
        title: 'Exportar backup',
        defaultPath: `lebloc-${toIsoDate(new Date())}.db`,
        filters: BACKUP_FILTERS,
      });
      if (result.canceled || !result.filePath) return { status: 'cancelled' };
      await exportBackup(holder.db, result.filePath, new Date());
      return { status: 'done', path: result.filePath };
    },
    async restoreBackup() {
      const result = await showOpen({
        title: 'Restaurar backup',
        properties: ['openFile'],
        filters: BACKUP_FILTERS,
      });
      const [source] = result.filePaths;
      if (result.canceled || !source) return { status: 'cancelled' };
      await restoreKeepingExternal(ctx, () => holder.restoreFrom(source, backupDir, new Date()));
      return { status: 'done', path: source };
    },
    async pickFolder() {
      const result = await showOpen({ title: 'Carpeta para copiar los backups', properties: ['openDirectory', 'createDirectory'] });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    backupNow: () => createBackup(holder.db, backupDir, new Date()),
    async pickSpreadsheet() {
      const result = await showOpen({ title: 'Importar planilla', properties: ['openFile'], filters: SPREADSHEET_FILTERS });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
  };
}

async function start(): Promise<void> {
  const userData = app.getPath('userData');
  const backupDir = join(userData, 'backups');
  const dbPath = join(userData, 'lebloc.db');
  // Dev only: `npm run seed` swaps the database for sample data; the old one stays in backups/.
  const seed = !app.isPackaged && process.env.LEBLOC_SEED === '1' ? await import('./seed') : null;
  await seed?.setAsideForSeed(dbPath, backupDir, new Date());
  const holder = new DatabaseHolder(dbPath);
  seed?.seedDatabase(holder.db, new Date());
  const startupBackup = await createBackup(holder.db, backupDir, new Date());

  const ctx: Context = {
    get db() {
      return holder.db;
    },
    clock: systemClock,
  };
  const logError = (error: unknown) => log.error(error);
  const backups = createBackupOps(ctx, holder, backupDir, join(userData, 'google-drive.token'));
  const copyOutside = (file: string) =>
    Promise.all([mirrorBackup(ctx, file), driveBackup(ctx, file, backups)]).then((errors) => {
      for (const error of errors) if (error) logError(error);
    });
  registerIpc(ipcMain, createHandlers(ctx, backups), logError, APP_URL);

  let quitting = false;
  app.on('before-quit', (event) => {
    if (quitting) return;
    quitting = true;
    event.preventDefault();
    // A last backup and its copies on the way out, capped so closing never hangs on a slow folder or connection.
    void Promise.race([backups.backupNow().then(copyOutside), delay(QUIT_BACKUP_CAP_MS)])
      .catch(logError)
      .finally(() => {
        holder.close();
        app.quit();
      });
  });
  // Electron's default menu is in English and offers Reload and DevTools: only development keeps it.
  if (!process.env.ELECTRON_RENDERER_URL) Menu.setApplicationMenu(null);
  createWindow();
  // The copies out of the PC wait for the window: a slow folder or connection must not hold the app back.
  void copyOutside(startupBackup);
}

// A second instance would open the same SQLite file and race restores against writes.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app
    .whenReady()
    .then(start)
    .catch((error: unknown) => {
      log.error(error);
      dialog.showErrorBox('Lebloc no pudo iniciar', 'Revisá el archivo de log de la aplicación.');
      app.quit();
    });
}

app.on('window-all-closed', () => app.quit());
