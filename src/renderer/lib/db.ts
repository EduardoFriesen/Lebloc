export async function dbQuery(sql: string, params?: unknown[]) {
  return (window as any).api.query(sql, params)
}

export async function dbRun(sql: string, params?: unknown[]) {
  return (window as any).api.run(sql, params)
}

export async function dbGet(sql: string, params?: unknown[]) {
  return (window as any).api.get(sql, params)
}
