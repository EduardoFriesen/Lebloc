import { create } from 'zustand'
import { Profesor } from '../types'
import { dbQuery, dbRun } from '../lib/db'

interface ProfesorState {
  profesores: Profesor[]
  loading: boolean
  fetchProfesores: () => Promise<void>
  createProfesor: (data: Omit<Profesor, 'id' | 'createdAt'>) => Promise<number>
  updateProfesor: (id: number, data: Partial<Profesor>) => Promise<void>
  deleteProfesor: (id: number) => Promise<void>
}

export const useProfesorStore = create<ProfesorState>((set, get) => ({
  profesores: [],
  loading: false,

  fetchProfesores: async () => {
    set({ loading: true })
    const profesores = await dbQuery('SELECT * FROM profesores WHERE activo = 1 ORDER BY apellido, nombre')
    set({ profesores, loading: false })
  },

  createProfesor: async (data) => {
    const now = new Date().toISOString()
    const result = await dbRun(
      `INSERT INTO profesores (nombre, apellido, telefono, email, activo, createdAt)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [data.nombre, data.apellido, data.telefono, data.email, now]
    )
    await get().fetchProfesores()
    return result.lastInsertRowid
  },

  updateProfesor: async (id, data) => {
    const fields: string[] = []
    const values: unknown[] = []
    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'createdAt') {
        fields.push(`${key} = ?`)
        values.push(value)
      }
    })
    values.push(id)
    await dbRun(`UPDATE profesores SET ${fields.join(', ')} WHERE id = ?`, values)
    await get().fetchProfesores()
  },

  deleteProfesor: async (id) => {
    await dbRun('UPDATE profesores SET activo = 0 WHERE id = ?', [id])
    await get().fetchProfesores()
  },
}))
