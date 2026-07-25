CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  dni TEXT UNIQUE,
  telefono TEXT,
  fechaNacimiento TEXT,
  esMenor INTEGER DEFAULT 0,
  telefonoResponsable TEXT,
  contactoEmergencia TEXT,
  fechaIngreso TEXT NOT NULL,
  fotoPath TEXT,
  pdfPath TEXT,
  fechaUltimaActualizacion TEXT,
  activo INTEGER DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  clasesSemanales INTEGER NOT NULL,
  precio REAL NOT NULL,
  recargoProfesor REAL DEFAULT 0,
  esDiario INTEGER DEFAULT 0,
  activo INTEGER DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profesores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  telefono TEXT,
  email TEXT,
  activo INTEGER DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS planes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clienteId INTEGER NOT NULL REFERENCES clientes(id),
  paseId INTEGER NOT NULL REFERENCES pases(id),
  clasesSemanales INTEGER NOT NULL,
  precio REAL NOT NULL,
  pasesRestantes INTEGER NOT NULL,
  profesorId INTEGER REFERENCES profesores(id),
  fechaInicio TEXT NOT NULL,
  activo INTEGER DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  planId INTEGER NOT NULL REFERENCES planes(id),
  monto REAL NOT NULL,
  fecha TEXT NOT NULL,
  metodoPago TEXT NOT NULL,
  observaciones TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS asistencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  planId INTEGER NOT NULL REFERENCES planes(id),
  fecha TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  cantidadPorPaquete INTEGER NOT NULL,
  costoPaquete REAL NOT NULL,
  costoUnitario REAL NOT NULL,
  precioVenta REAL NOT NULL,
  activo INTEGER DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  total REAL NOT NULL,
  metodoPago TEXT NOT NULL,
  cajaId INTEGER REFERENCES caja(id),
  observaciones TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ventaDetalles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ventaId INTEGER NOT NULL REFERENCES ventas(id),
  tipo TEXT NOT NULL,
  referenciaId INTEGER,
  cantidad INTEGER NOT NULL,
  precioUnitario REAL NOT NULL,
  subtotal REAL NOT NULL,
  profesorId INTEGER REFERENCES profesores(id),
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS empleados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  telefono TEXT,
  direccion TEXT,
  fechaNacimiento TEXT,
  fechaContratacion TEXT NOT NULL,
  valorHora REAL NOT NULL,
  activo INTEGER DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS horasTrabajadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empleadoId INTEGER NOT NULL REFERENCES empleados(id),
  fecha TEXT NOT NULL,
  horas REAL NOT NULL,
  costo REAL NOT NULL,
  metodoPago TEXT NOT NULL,
  pagado INTEGER DEFAULT 0,
  fechaPago TEXT,
  observaciones TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria TEXT NOT NULL,
  descripcion TEXT,
  monto REAL NOT NULL,
  fecha TEXT NOT NULL,
  metodoPago TEXT NOT NULL,
  ventaId INTEGER REFERENCES ventas(id),
  horasTrabajadasId INTEGER REFERENCES horasTrabajadas(id),
  creadoPor TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS caja (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fechaApertura TEXT NOT NULL,
  montoInicial REAL NOT NULL,
  fechaCierre TEXT,
  montoFinal REAL,
  diferencia REAL,
  estado TEXT DEFAULT 'abierta',
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
