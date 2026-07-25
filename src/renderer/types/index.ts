export interface Cliente {
  id: number
  nombre: string
  apellido: string
  dni: string | null
  telefono: string | null
  fechaNacimiento: string | null
  esMenor: number
  telefonoResponsable: string | null
  contactoEmergencia: string | null
  fechaIngreso: string
  fotoPath: string | null
  pdfPath: string | null
  fechaUltimaActualizacion: string | null
  activo: number
  createdAt: string
  updatedAt: string
}

export interface Pase {
  id: number
  nombre: string
  clasesSemanales: number
  precio: number
  recargoProfesor: number
  esDiario: number
  activo: number
  createdAt: string
  updatedAt: string
}

export interface Plan {
  id: number
  clienteId: number
  paseId: number
  clasesSemanales: number
  precio: number
  pasesRestantes: number
  profesorId: number | null
  fechaInicio: string
  activo: number
  createdAt: string
  clienteNombre?: string
  paseNombre?: string
  profesorNombre?: string
}

export interface Pago {
  id: number
  planId: number
  monto: number
  fecha: string
  metodoPago: 'efectivo' | 'transferencia' | 'tarjeta'
  observaciones: string | null
  createdAt: string
  planNombre?: string
  clienteNombre?: string
}

export interface Asistencia {
  id: number
  planId: number
  fecha: string
  createdAt: string
}

export interface Profesor {
  id: number
  nombre: string
  apellido: string
  telefono: string | null
  email: string | null
  activo: number
  createdAt: string
}

export interface Producto {
  id: number
  nombre: string
  cantidadPorPaquete: number
  costoPaquete: number
  costoUnitario: number
  precioVenta: number
  activo: number
  createdAt: string
}

export interface Venta {
  id: number
  fecha: string
  total: number
  metodoPago: 'efectivo' | 'transferencia' | 'tarjeta'
  cajaId: number
  observaciones: string | null
  createdAt: string
}

export interface VentaDetalle {
  id: number
  ventaId: number
  tipo: 'pase' | 'producto' | 'diario'
  referenciaId: number
  cantidad: number
  precioUnitario: number
  subtotal: number
  profesorId: number | null
  createdAt: string
}

export interface Empleado {
  id: number
  nombre: string
  apellido: string
  telefono: string | null
  direccion: string | null
  fechaNacimiento: string | null
  fechaContratacion: string
  valorHora: number
  activo: number
  createdAt: string
}

export interface HorasTrabajadas {
  id: number
  empleadoId: number
  fecha: string
  horas: number
  costo: number
  metodoPago: 'efectivo' | 'transferencia'
  pagado: number
  fechaPago: string | null
  observaciones: string | null
  createdAt: string
  empleadoNombre?: string
}

export interface Gasto {
  id: number
  categoria: string
  descripcion: string | null
  monto: number
  fecha: string
  metodoPago: 'efectivo' | 'transferencia' | 'tarjeta'
  ventaId: number | null
  horasTrabajadasId: number | null
  creadoPor: string | null
  createdAt: string
}

export interface Caja {
  id: number
  fechaApertura: string
  montoInicial: number
  fechaCierre: string | null
  montoFinal: number | null
  diferencia: number | null
  estado: 'abierta' | 'cerrada'
  createdAt: string
}

export type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta'
