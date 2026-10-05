import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
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

function isAppUrl(url: string): boolean {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  return devUrl ? url.startsWith(devUrl) : url.startsWith('file://');
}

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
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
  return win;
}

function createBackupOps(holder: DatabaseHolder, backupDir: string): BackupOps {
  return {
    async exportBackup() {
      const result = await dialog.showSaveDialog({
        title: 'Exportar backup',
        defaultPath: `lebloc-${toIsoDate(new Date())}.db`,
        filters: BACKUP_FILTERS,
      });
      if (result.canceled || !result.filePath) return { status: 'cancelled' };
      await writeBackupFile(holder.db, result.filePath);
      return { status: 'done', path: result.filePath };
    },
    async restoreBackup() {
      const result = await dialog.showOpenDialog({
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
  const holder = new DatabaseHolder(join(userData, 'lebloc.db'));
  await createBackup(holder.db, backupDir, new Date());

  const ctx: Context = {
    get db() {
      return holder.db;
    },
    clock: systemClock,
  };
  registerIpc(ipcMain, createHandlers(ctx, createBackupOps(holder, backupDir)), (error) => log.error(error));
  app.on('before-quit', () => holder.close());
  createWindow();
}

app
  .whenReady()
  .then(start)
  .catch((error: unknown) => {
    log.error(error);
    dialog.showErrorBox('Lebloc no pudo iniciar', 'Revisá el archivo de log de la aplicación.');
    app.quit();
  });

app.on('window-all-closed', () => app.quit());
