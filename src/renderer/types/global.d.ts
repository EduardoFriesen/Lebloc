interface Window {
  api: {
    query: (sql: string, params?: unknown[]) => Promise<unknown[]>
    run: (sql: string, params?: unknown[]) => Promise<unknown>
    get: (sql: string, params?: unknown[]) => Promise<unknown>
  }
}
