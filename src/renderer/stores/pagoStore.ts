import { create } from 'zustand'
import { Pago } from '../types'
import { dbQuery, dbRun } from '../lib/db'

interface PagoState {
  pagos: Pago[]
  loading: boolean
  fetchPagos: (planId?: number) => Promise<void>
  createPago: (data: { planId: number; monto: number; metodoPago: string; observaciones?: string }) => Promise<number>
}

export const usePagoStore = create<PagoState>((set) => ({
  pagos: [],
  loading: false,

  fetchPagos: async (planId) => {
    set({ loading: true })
    let sql = `
      SELECT pg.*, p.precio as planPrecio, c.nombre || ' ' || c.apellido as clienteNombre
      FROM pagos pg
      JOIN planes p ON pg.planId = p.id
      JOIN clientes c ON p.clienteId = c.id
    `
    const params: unknown[] = []
    if (planId) {
      sql += ' WHERE pg.planId = ?'
      params.push(planId)
    }
    sql += ' ORDER BY pg.fecha DESC'
    const pagos = await dbQuery(sql, params)
    set({ pagos, loading: false })
  },

  createPago: async (data) => {
    const now = new Date().toISOString()
    const result = await dbRun(
      `INSERT INTO pagos (planId, monto, fecha, metodoPago, observaciones, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.planId, data.monto, now, data.metodoPago, data.observaciones || null, now]
    )
    return result.lastInsertRowid
  },
}))
