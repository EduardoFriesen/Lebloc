import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Will be populated as we add DB queries
})
