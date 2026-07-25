import { create } from 'zustand'
import { Cliente } from '../types'
import { dbQuery, dbRun } from '../lib/db'

interface ClienteState {
  clientes: Cliente[]
  selectedCliente: Cliente | null
  search: string
  loading: boolean
  setSearch: (search: string) => void
  fetchClientes: () => Promise<void>
  createCliente: (data: Omit<Cliente, 'id' | 'createdAt' | 'updatedAt'>) => Promise<number>
  updateCliente: (id: number, data: Partial<Cliente>) => Promise<void>
  deleteCliente: (id: number) => Promise<void>
  selectCliente: (cliente: Cliente | null) => void
}

export const useClienteStore = create<ClienteState>((set, get) => ({
  clientes: [],
  selectedCliente: null,
  search: '',
  loading: false,

  setSearch: (search) => set({ search }),

  fetchClientes: async () => {
    set({ loading: true })
    const { search } = get()
    let sql = 'SELECT * FROM clientes WHERE activo = 1'
    const params: unknown[] = []

    if (search) {
      sql += ' AND (nombre LIKE ? OR apellido LIKE ? OR dni LIKE ?)'
      const term = `%${search}%`
      params.push(term, term, term)
    }

    sql += ' ORDER BY apellido, nombre'
    const clientes = await dbQuery(sql, params)
    set({ clientes, loading: false })
  },

  createCliente: async (data) => {
    const now = new Date().toISOString()
    const result = await dbRun(
      `INSERT INTO clientes (nombre, apellido, dni, telefono, fechaNacimiento, esMenor,
        telefonoResponsable, contactoEmergencia, fechaIngreso, fotoPath, pdfPath,
        fechaUltimaActualizacion, activo, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [data.nombre, data.apellido, data.dni, data.telefono, data.fechaNacimiento,
       data.esMenor, data.telefonoResponsable, data.contactoEmergencia,
       data.fechaIngreso, data.fotoPath, data.pdfPath, now, now, now]
    )
    await get().fetchClientes()
    return result.lastInsertRowid
  },

  updateCliente: async (id, data) => {
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

    await dbRun(`UPDATE clientes SET ${fields.join(', ')} WHERE id = ?`, values)
    await get().fetchClientes()
  },

  deleteCliente: async (id) => {
    await dbRun('UPDATE clientes SET activo = 0 WHERE id = ?', [id])
    await get().fetchClientes()
  },

  selectCliente: (cliente) => set({ selectedCliente: cliente }),
}))
