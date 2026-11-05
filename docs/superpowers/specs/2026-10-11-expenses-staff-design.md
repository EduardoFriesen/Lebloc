# Lebloc — Subproyecto 3: gastos y empleados (diseño)

Fecha: 2026-10-11
Fuente de requisitos: `lebloc.md`

## Contexto

`lebloc.md` pide cargar servicios (luz, gas, alquiler, etc.) para el balance mensual y un apartado de empleados con sus datos y las horas que trabajaron; pueden ser estables u ocasionales y su costo se suma al balance. Este subproyecto da los egresos que necesita Finanzas (subproyecto 4, `2026-10-11-finance-design.md`).

Decisiones tomadas con el usuario:
- **Empleados por hora.** Todos tienen un valor hora; "estable" u "ocasional" es solo una etiqueta para filtrar.
- **Horas por turno:** una fila por día trabajado, con fecha y horas.
- **Sin pagos a empleados.** El costo es horas × valor hora y va directo al balance.
- **Gastos a mano** con categoría fija y un botón "Repetir" que copia uno anterior con la fecha de hoy.
- **La mercadería del kiosco no es un gasto:** su costo ya se descuenta con `unit_cost_cents` de cada venta. Cargarla también la contaría dos veces.
- Gastos y turnos **no aceptan fechas futuras**.

Rama: `feat/expenses-staff`, desde `feat/kiosk` (`main` sigue en `e3e01dc`).

## Diseño

### Migración `006_expenses_staff.ts`
```sql
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('rent','electricity','gas','water','internet','taxes','maintenance','other')),
  description TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL CHECK (method IN ('cash','transfer')),
  paid_at TEXT NOT NULL,          -- YYYY-MM-DD
  recorded_at TEXT NOT NULL,      -- ISO
  voided_at TEXT
);
CREATE INDEX idx_expenses_paid_at ON expenses(paid_at);

CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dni TEXT,
  phone TEXT,
  address TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('staff','casual')),   -- estable / ocasional
  hourly_rate_cents INTEGER NOT NULL CHECK (hourly_rate_cents >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

CREATE TABLE work_shifts (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  worked_on TEXT NOT NULL,                                          -- YYYY-MM-DD
  minutes INTEGER NOT NULL CHECK (minutes > 0 AND minutes <= 1440),
  hourly_rate_cents INTEGER NOT NULL CHECK (hourly_rate_cents >= 0), -- snapshot
  cost_cents INTEGER NOT NULL CHECK (cost_cents >= 0),              -- snapshot
  note TEXT,
  recorded_at TEXT NOT NULL,
  voided_at TEXT
);
CREATE INDEX idx_work_shifts_employee ON work_shifts(employee_id);
CREATE INDEX idx_work_shifts_worked_on ON work_shifts(worked_on);
```
- Un turno no se edita: se anula y se carga de nuevo. Por eso `cost_cents` se guarda como snapshot, igual que `sales.total_cents`, y Finanzas suma sin volver a redondear.
- El total de gastos del mes no se guarda: se calcula.

### Dominio: `src/domain/staff.ts` (puro, con test)
- `hoursToMinutes(hours)` = `Math.round(hours × 60)`.
- `shiftCostCents(minutes, hourlyRateCents)` = `Math.round(minutes × rate / 60)`.
- Errores nuevos en `domain/errors.ts`:
  - `DATE_IN_FUTURE`: "La fecha no puede ser posterior a hoy."
  - `EMPLOYEE_INACTIVE`: "El empleado está inactivo."
- `NOT_FOUND` y `ALREADY_VOIDED` ya existen y se reusan.

### Contrato IPC (`shared/`)
| Canal | Entrada | Salida |
|---|---|---|
| `expenses:month` | `{ month: 'YYYY-MM' }` | `ExpenseMonth`: `{ expenses: Expense[]; totalCents; byCategory: { category, cents }[] }`. Incluye los anulados, pero no los suma. |
| `expenses:create` | `{ category, description, amountCents, method, paidAt }` | `Expense` |
| `expenses:void` | `idInput` | `Expense` |
| `employees:list` | `{ includeInactive, month }` | `Employee[]` con `monthMinutes` y `monthCostCents` |
| `employees:create` / `employees:update` | `employeeInput` (+ `id`) | `Employee` |
| `shifts:month` | `{ month, employeeId? }` | `WorkShift[]` con `employeeName` |
| `shifts:create` | `{ employeeId, workedOn, minutes, note }` | `WorkShift` |
| `shifts:void` | `idInput` | `WorkShift` |
| `staff:stats` | `{ month }` | `{ active, staff, casual, monthMinutes, monthCostCents }` |

- `EXPENSE_CATEGORIES` y `EMPLOYEE_KINDS` van en `shared/`. Las etiquetas en español (`EXPENSE_CATEGORY_LABELS`, `EMPLOYEE_KIND_LABELS`) van en `renderer/lib/format.ts`.
- **Seguridad:** el cliente no manda ni el valor hora ni el costo. El servicio lee la tarifa vigente del empleado y calcula el snapshot. `recorded_at` lo pone `ctx.clock`.

### Backend
- `main/repos/expenses.ts`, `main/repos/employees.ts` y `main/repos/shifts.ts`: solo SQL.
- `main/services/expenses.ts` y `main/services/employees.ts` (incluye turnos): transacciones y errores de dominio.
- `ipc/handlers.ts`: los handlers nuevos.

### UI
- **Navegación:** "Empleados" (`/empleados`) y "Gastos" (`/gastos`) después de Profesores.
- **`/gastos` (`ExpensesPage.tsx`):** layout `WITH_SUMMARY` con un `<input type="month">` (el mes actual por defecto) y el botón "Nuevo gasto".
  - Tabla con fecha, categoría, detalle, medio, importe y las acciones Repetir y Anular. Los anulados se ven tachados.
  - El resumen muestra el total del mes y una fila por categoría; cada fila filtra la tabla. También muestra "Sueldos del mes", que lleva a `/empleados`.
  - `ExpenseForm.tsx` en un `Dialog`. Repetir lo abre con los datos del gasto y la fecha de hoy. Una nota aclara que la mercadería del kiosco no va acá.
- **`/empleados` (`EmployeesPage.tsx`):** `WITH_SUMMARY` con el filtro de mes y el botón "Nuevo empleado".
  - Tarjetas con el badge Estable u Ocasional, el valor hora, las horas y el costo del mes. Las acciones son "Cargar horas" y "Editar"; al tocar la tarjeta se filtra la tabla de turnos.
  - Tabla "Turnos" con fecha, empleado, horas, valor hora, costo, nota y Anular.
  - El resumen muestra activos, estables, ocasionales, horas del mes y costo del mes.
  - `EmployeeForm.tsx` y `ShiftForm.tsx` van en `Dialog`. Las horas se cargan como número con decimales (por ejemplo 4,5) y se convierten con `hoursToMinutes`.
- Los 4 estados vienen de `AsyncView`.

### Seed
En `seedVolume.ts`, a través de los servicios:
- 3 empleados: 2 estables y 1 ocasional.
- Turnos de los últimos 2 meses.
- Gastos mensuales: alquiler, luz, gas, internet y algún mantenimiento.

### Tests
- `domain/staff.test.ts`.
- `migrations.test.ts`.
- `services/expenses.test.ts`.
- `services/employees.test.ts`.
- `shared/schemas.test.ts`.
- E2E `e2e/expenses-staff.spec.ts`.

### Fuera de alcance
- Pagos y saldo de empleados.
- Gastos recurrentes automáticos.
- Gastos de mercadería del kiosco.
