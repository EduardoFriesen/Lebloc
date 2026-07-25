declare module '*.css'

interface Window {
  api: {
    query: (sql: string, params?: unknown[]) => Promise<any[]>
    run: (sql: string, params?: unknown[]) => Promise<any>
    get: (sql: string, params?: unknown[]) => Promise<any>
  }
}
