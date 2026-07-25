import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { getDatabase, query, run, get } from './database'

function createWindow() {
  getDatabase()

  ipcMain.handle('db:query', (_, sql, params) => {
    try { return query(sql, params) }
    catch (e: any) { return { error: e.message } }
  })
  ipcMain.handle('db:run', (_, sql, params) => {
    try { return run(sql, params) }
    catch (e: any) { return { error: e.message } }
  })
  ipcMain.handle('db:get', (_, sql, params) => {
    try { return get(sql, params) }
    catch (e: any) { return { error: e.message } }
  })

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Lebloc',
    backgroundColor: '#F1F0ED',
  })

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
