import { create } from 'zustand'
import { Pase } from '../types'
import { dbQuery, dbRun } from '../lib/db'

interface PaseState {
  pases: Pase[]
  loading: boolean
  fetchPases: () => Promise<void>
  createPase: (data: Omit<Pase, 'id' | 'createdAt' | 'updatedAt'>) => Promise<number>
  updatePase: (id: number, data: Partial<Pase>) => Promise<void>
  deletePase: (id: number) => Promise<void>
}

export const usePaseStore = create<PaseState>((set, get) => ({
  pases: [],
  loading: false,

  fetchPases: async () => {
    set({ loading: true })
    const pases = await dbQuery('SELECT * FROM pases WHERE activo = 1 ORDER BY nombre')
    set({ pases, loading: false })
  },

  createPase: async (data) => {
    const now = new Date().toISOString()
    const result = await dbRun(
      `INSERT INTO pases (nombre, clasesSemanales, precio, recargoProfesor, esDiario, activo, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      [data.nombre, data.clasesSemanales, data.precio, data.recargoProfesor, data.esDiario, now, now]
    )
    await get().fetchPases()
    return result.lastInsertRowid
  },

  updatePase: async (id, data) => {
    const now = new Date().toISOString()
    const fields: string[] = []
    const values: unknown[] = []
    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'createdAt') {
        fields.push(`${key} = ?`)
        values.push(value)
      }
    })
    fields.push('updatedAt = ?')
    values.push(now)
    values.push(id)
    await dbRun(`UPDATE pases SET ${fields.join(', ')} WHERE id = ?`, values)
    await get().fetchPases()
  },

  deletePase: async (id) => {
    await dbRun('UPDATE pases SET activo = 0 WHERE id = ?', [id])
    await get().fetchPases()
  },
}))
