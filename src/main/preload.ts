import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  query: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:query', sql, params),
  run: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:run', sql, params),
  get: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:get', sql, params),
})
