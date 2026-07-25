# Lebloc — Diseño del Sistema de Gestión

Sistema de gestión integral para un local de escalada bajo techo.

## Stack

- **Electron** — shell de escritorio (Windows)
- **React + TypeScript** — frontend
- **Tailwind CSS** — estilos
- **Zustand** — gestión de estado
- **better-sqlite3** — base de datos SQLite (síncrono)
- **xlsx** — importación de planillas Excel

Single user. Sin autenticación.

## Arquitectura

```
src/
  main/          ← proceso principal de Electron (ventana, DB)
  renderer/      ← proceso del frontend (React)
    components/  ← componentes reutilizables (Tablas, Forms, Modales)
    pages/       ← una página por módulo
    stores/      ← stores de Zustand (uno por módulo)
    hooks/       ← hooks custom
    lib/         ← utilidades, helpers, queries a la DB
  database/      ← esquema SQL, migraciones, seed data
```

Navegación: sidebar izquierda con iconos por módulo. Una página completa por módulo.

## Base de datos

### clientes

| Columna | Tipo | Descripción |
|---|---|---|
| id | INTEGER PK | autoincrement |
| nombre | TEXT NOT NULL | |
| apellido | TEXT NOT NULL | |
| dni | TEXT UNIQUE | |
| telefono | TEXT | |
| fechaNacimiento | TEXT | |
| esMenor | INTEGER DEFAULT 0 | boolean |
| telefonoResponsable | TEXT | si es menor |
| contactoEmergencia | TEXT | si es mayor |
| fechaIngreso | TEXT | fecha alta de la ficha |
| fotoPath | TEXT | ruta imagen opcional |
| pdfPath | TEXT | ruta PDF opcional |
| fechaUltimaActualizacion | TEXT | última modificación de ficha |
| activo | INTEGER DEFAULT 1 | boolean |
| createdAt | TEXT | |
| updatedAt | TEXT | |

### pases (tipos de pase)

| Columna | Tipo | Descripción |
|---|---|---|
| id | INTEGER PK | autoincrement |
| nombre | TEXT NOT NULL | ej: "2x semana", "Diario" |
| clasesSemanales | INTEGER NOT NULL | cantidad de clases por semana |
| precio | REAL NOT NULL | precio mensual del plan |
| recargoProfesor | REAL DEFAULT 0 | comisión del profesor externo |
| esDiario | INTEGER DEFAULT 0 | boolean, pase diario suelto |
| activo | INTEGER DEFAULT 1 | boolean |
| createdAt | TEXT | |
| updatedAt | TEXT | |

### planes (pases asignados a clientes)

| Columna | Tipo | Descripción |
|---|---|---|
| id | INTEGER PK | autoincrement |
| clienteId | INTEGER FK → clientes | |
| paseId | INTEGER FK → pases | tipo de pase |
| clasesSemanales | INTEGER NOT NULL | copiado del pase al asignar |
| precio | REAL NOT NULL | copiado del pase al asignar |
| pasesRestantes | INTEGER NOT NULL | = clasesSemanales × 4 al iniciar/renovar |
| profesorId | INTEGER FK → profesores | nullable |
| fechaInicio | TEXT NOT NULL | fecha de inicio o renovación |
| activo | INTEGER DEFAULT 1 | boolean |
| createdAt | TEXT | |

### pagos (pagos parciales de planes)

| Columna | Tipo | Descripción |
|---|---|---|
| id | INTEGER PK | autoincrement |
| planId | INTEGER FK → planes | |
| monto | REAL NOT NULL | monto de esta entrega |
| fecha | TEXT NOT NULL | |
| metodoPago | TEXT NOT NULL | efectivo / transferencia / tarjeta |
| observaciones | TEXT | |
| createdAt | TEXT | |

### asistencias

| Columna | Tipo | Descripción |
|---|---|---|
| id | INTEGER PK | autoincrement |
| planId | INTEGER FK → planes | |
| fecha | TEXT NOT NULL | |
| createdAt | TEXT | |

Al registrar asistencia: `planes.pasesRestantes -= 1`.

### profesores (instructores externos)

| Columna | Tipo | Descripción |
|---|---|---|
| id | INTEGER PK | autoincrement |
| nombre | TEXT NOT NULL | |
| apellido | TEXT NOT NULL | |
| telefono | TEXT | |
| email | TEXT | |
| activo | INTEGER DEFAULT 1 | boolean |
| createdAt | TEXT | |

### productos (kiosco)

| Columna | Tipo | Descripción |
|---|---|---|
| id | INTEGER PK | autoincrement |
| nombre | TEXT NOT NULL | |
| cantidadPorPaquete | INTEGER NOT NULL | unidades por paquete |
| costoPaquete | REAL NOT NULL | costo total del paquete |
| costoUnitario | REAL NOT NULL | calculado: costoPaquete / cantidadPorPaquete |
| precioVenta | REAL NOT NULL | precio final al público |
| activo | INTEGER DEFAULT 1 | boolean |
| createdAt | TEXT | |

Sin control de stock.

### ventas

| Columna | Tipo | Descripción |
|---|---|---|
| id | INTEGER PK | autoincrement |
| fecha | TEXT NOT NULL | |
| total | REAL NOT NULL | |
| metodoPago | TEXT NOT NULL | efectivo / transferencia / tarjeta |
| cajaId | INTEGER FK → caja | |
| observaciones | TEXT | |
| createdAt | TEXT | |

### ventaDetalles

| Columna | Tipo | Descripción |
|---|---|---|
| id | INTEGER PK | autoincrement |
| ventaId | INTEGER FK → ventas | |
| tipo | TEXT NOT NULL | pase / producto / diario |
| referenciaId | INTEGER | productoId (si tipo=producto) o paseId (si tipo=pase/diario) |
| cantidad | INTEGER NOT NULL | |
| precioUnitario | REAL NOT NULL | |
| subtotal | REAL NOT NULL | cantidad × precioUnitario |
| profesorId | INTEGER FK → profesores | nullable |
| createdAt | TEXT | |

Permite mezclar pases + productos en una misma venta.

### empleados

| Columna | Tipo | Descripción |
|---|---|---|
| id | INTEGER PK | autoincrement |
| nombre | TEXT NOT NULL | |
| apellido | TEXT NOT NULL | |
| telefono | TEXT | |
| direccion | TEXT | |
| fechaNacimiento | TEXT | |
| fechaContratacion | TEXT | |
| valorHora | REAL NOT NULL | |
| activo | INTEGER DEFAULT 1 | boolean |
| createdAt | TEXT | |

### horasTrabajadas

| Columna | Tipo | Descripción |
|---|---|---|
| id | INTEGER PK | autoincrement |
| empleadoId | INTEGER FK → empleados | |
| fecha | TEXT NOT NULL | |
| horas | REAL NOT NULL | |
| costo | REAL NOT NULL | horas × valorHora |
| metodoPago | TEXT NOT NULL | efectivo / transferencia |
| pagado | INTEGER DEFAULT 0 | boolean |
| fechaPago | TEXT | |
| observaciones | TEXT | |
| createdAt | TEXT | |

Al registrar horas trabajadas: se genera automáticamente un registro en `gastos`.

### gastos

| Columna | Tipo | Descripción |
|---|---|---|
| id | INTEGER PK | autoincrement |
| categoria | TEXT NOT NULL | alquiler, luz, gas, mercadería, sueldos, etc. |
| descripcion | TEXT | |
| monto | REAL NOT NULL | |
| fecha | TEXT NOT NULL | |
| metodoPago | TEXT NOT NULL | |
| ventaId | INTEGER FK → ventas | nullable |
| horasTrabajadasId | INTEGER FK → horasTrabajadas | nullable |
| creadoPor | TEXT | |
| createdAt | TEXT | |

### caja

| Columna | Tipo | Descripción |
|---|---|---|
| id | INTEGER PK | autoincrement |
| fechaApertura | TEXT NOT NULL | |
| montoInicial | REAL NOT NULL | |
| fechaCierre | TEXT | null si está abierta |
| montoFinal | REAL | |
| diferencia | REAL | montoFinal - (montoInicial + ingresos - egresos) |
| estado | TEXT DEFAULT 'abierta' | abierta / cerrada |
| createdAt | TEXT | |

## Lógica de negocio

### Planes y asistencias
- Al crear un plan: `pasesRestantes = clasesSemanales × 4` (ej: 2x/sem → 8 pases)
- Al asistir: `pasesRestantes -= 1`
- Sin vencimiento, pero alerta cuando `pasesRestantes ≤ 2`
- Al renovar: nuevo registro con `pasesRestantes` reiniciado y fecha actual, si todavia quedaban pases y se renueva se suman.

### Pagos parciales
- Cada pago se registra en `pagos` vinculado al plan
- Si un cliente tiene deuda (`saldoPendiente > 0`), se muestra alerta al operador
- Se permite agregar planes independientemente de la deuda
- Los pagos se registran en caja

### Productos kiosco
- Sin control de stock
- Al cargar: cantidadPorPaquete, costoPaquete → costoUnitario calculado automáticamente
- Se vende unitariamente o cantidad

### Empleados y horas
- Se registran horas trabajadas con fecha, horas, método de pago
- costo = horas × valorHora
- Se genera gasto automáticamente al registrar horas

### Caja
- Apertura: montoInicial + fecha, todos los dias al iniciar el programa se ingresa la cantidad de efectivo en caja
- Cierre: montoFinal, diferencia calculada, fecha
- Solo una caja abierta a la vez
- Ventas y pagos se vinculan a la sesión de caja activa

### Informes
- Ingresos, gastos, ganancias
- Pases vendidos
- Análisis de tendencias
- Consumo histórico de productos
- Comisiones a profesores
- Horas trabajadas por empleados
- Ranking de productos más/menos vendidos
- Retención de clientes
- Planes con pases bajos
- Flujo de caja

### Importación Excel
- Clientes y pases desde planilla existente
- Usar librería `xlsx` para lectura
- Mapeo de columnas configurable

## Módulos / Pantallas

| Módulo | Funcionalidades |
|---|---|
| Clientes | CRUD, ficha completa, contacto responsable/emergencia, foto/PDF opcional, alerta deudor al ingresar, importación Excel |
| Planes | Crear plan a cliente, renovar, registrar asistencia (descuenta 1 pase), alerta pases bajos |
| Pases | Configurar tipos de pase (nombre, clases/semana, precio, recargo profesor, esDiario) |
| Pagos | Registrar pagos parciales, historial de pagos por plan, deuda pendiente |
| Profesores | CRUD de instructores externos |
| Ventas | Registrar venta (pases + kiosco), método de pago |
| Kiosco | CRUD productos, costo unitario calculado |
| Empleados | CRUD, datos personales + valor hora |
| Horas trabajadas | Registrar horas, costo automático, método de pago |
| Gastos | CRUD, categorías, se generan desde horas trabajadas |
| Caja | Apertura, cierre, diferencia |
| Informes | Dashboard con todos los reportes |

## Descomposición en fases

El sistema tiene 13 tablas y 12 módulos. Se implementará en fases:

**Fase 1 — Core** (base del sistema):
- Esquema de base de datos + migraciones
- Clientes (CRUD + ficha)
- Pases (tipos configurables)
- Planes (asignación + asistencia)
- Pagos parciales

**Fase 2 — Comercial**:
- Profesores
- Ventas + ventaDetalles
- Kiosco (productos)
- Caja (apertura/cierre)

**Fase 3 — Administración**:
- Empleados
- Horas trabajadas
- Gastos

**Fase 4 — Informes e Importación**:
- Todos los informes
- Importación Excel
