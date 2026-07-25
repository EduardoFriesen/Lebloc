import { create } from 'zustand'
import { Plan } from '../types'
import { dbQuery, dbRun } from '../lib/db'

interface PlanState {
  planes: Plan[]
  loading: boolean
  fetchPlanes: () => Promise<void>
  createPlan: (data: { clienteId: number; paseId: number; profesorId?: number }) => Promise<number>
  renovarPlan: (planId: number) => Promise<number>
  registrarAsistencia: (planId: number) => Promise<void>
}

export const usePlanStore = create<PlanState>((set, get) => ({
  planes: [],
  loading: false,

  fetchPlanes: async () => {
    set({ loading: true })
    const planes = await dbQuery(`
      SELECT p.*, c.nombre || ' ' || c.apellido as clienteNombre,
             pa.nombre as paseNombre,
             pr.nombre || ' ' || pr.apellido as profesorNombre
      FROM planes p
      JOIN clientes c ON p.clienteId = c.id
      JOIN pases pa ON p.paseId = pa.id
      LEFT JOIN profesores pr ON p.profesorId = pr.id
      WHERE p.activo = 1
      ORDER BY c.apellido, c.nombre
    `)
    set({ planes, loading: false })
  },

  createPlan: async (data) => {
    const pase = (await dbQuery('SELECT * FROM pases WHERE id = ?', [data.paseId]))[0]
    const now = new Date().toISOString()
    const pasesRestantes = pase.clasesSemanales * 4

    const result = await dbRun(
      `INSERT INTO planes (clienteId, paseId, clasesSemanales, precio, pasesRestantes, profesorId, fechaInicio, activo, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [data.clienteId, data.paseId, pase.clasesSemanales, pase.precio, pasesRestantes,
       data.profesorId || null, now, now]
    )
    await get().fetchPlanes()
    return result.lastInsertRowid
  },

  renovarPlan: async (planId) => {
    const plan = (await dbQuery('SELECT * FROM planes WHERE id = ?', [planId]))[0]
    const now = new Date().toISOString()
    const pasesRestantes = plan.clasesSemanales * 4

    await dbRun('UPDATE planes SET activo = 0 WHERE id = ?', [planId])

    const result = await dbRun(
      `INSERT INTO planes (clienteId, paseId, clasesSemanales, precio, pasesRestantes, profesorId, fechaInicio, activo, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [plan.clienteId, plan.paseId, plan.clasesSemanales, plan.precio, pasesRestantes,
       plan.profesorId, now, now]
    )
    await get().fetchPlanes()
    return result.lastInsertRowid
  },

  registrarAsistencia: async (planId) => {
    const now = new Date().toISOString()
    await dbRun('INSERT INTO asistencias (planId, fecha, createdAt) VALUES (?, ?, ?)', [planId, now, now])
    await dbRun('UPDATE planes SET pasesRestantes = pasesRestantes - 1 WHERE id = ?', [planId])
    await get().fetchPlanes()
  },
}))
