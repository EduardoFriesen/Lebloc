import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions, type SaveDialogOptions } from 'electron';
import log from 'electron-log/main';
import { toIsoDate } from '../domain/dates';
import { createBackup, writeBackupFile } from './backup';
import { type Context, systemClock } from './context';
import { DatabaseHolder } from './db/holder';
import { type BackupOps, createHandlers } from './ipc/handlers';
import { registerIpc } from './ipc/register';

// E2E tests point userData at a temp dir so they never touch real data.
if (process.env.LEBLOC_USER_DATA) app.setPath('userData', process.env.LEBLOC_USER_DATA);

const BACKUP_FILTERS = [{ name: 'Base de datos de Lebloc', extensions: ['db'] }];

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

function createBackupOps(holder: DatabaseHolder, backupDir: string): BackupOps {
  return {
    async exportBackup() {
      const result = await showSave({
        title: 'Exportar backup',
        defaultPath: `lebloc-${toIsoDate(new Date())}.db`,
        filters: BACKUP_FILTERS,
      });
      if (result.canceled || !result.filePath) return { status: 'cancelled' };
      await writeBackupFile(holder.db, result.filePath);
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
      await holder.restoreFrom(source, backupDir, new Date());
      return { status: 'done', path: source };
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
  await createBackup(holder.db, backupDir, new Date());

  const ctx: Context = {
    get db() {
      return holder.db;
    },
    clock: systemClock,
  };
  registerIpc(ipcMain, createHandlers(ctx, createBackupOps(holder, backupDir)), (error) => log.error(error), APP_URL);
  app.on('before-quit', () => holder.close());
  createWindow();
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
