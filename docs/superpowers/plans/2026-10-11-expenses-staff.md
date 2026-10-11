# Gastos y empleados: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cargar gastos del local y horas de empleados para que el balance (subproyecto 4) tenga los egresos.

**Architecture:**
- Tres tablas nuevas: `expenses`, `employees` y `work_shifts`.
- La regla de costo va en `src/domain/staff.ts`.
- Repos solo SQL, servicios con las validaciones de dominio y canales IPC validados con Zod.
- Dos pantallas nuevas (`/gastos` y `/empleados`) con el layout `WITH_SUMMARY` y los componentes existentes.

**Tech Stack:** Electron, better-sqlite3, React 19, Tailwind 4, Zod 4, Vitest y Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-expenses-staff-design.md`

## Global Constraints

- El dinero va en centavos enteros. Los totales se calculan, salvo `work_shifts.cost_cents`, que es un snapshot inmutable.
- Los movimientos se anulan (`voided_at`), nunca se borran.
- El cliente nunca manda el valor hora ni el costo de un turno: los lee y calcula el servicio.
- Gastos y turnos no aceptan una fecha posterior a hoy (`DATE_IN_FUTURE`).
- La UI está en español y el código en inglés. Cada componente tiene sus 4 estados vía `AsyncView`.
- Comandos: `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:e2e` y `npm run audit`.

## Review Focus

1. **Editar el valor hora no cambia los turnos ya cargados.** Lo cubre un test en la Task 3.
2. **Un gasto o turno anulado no suma** en el total del mes, en las categorías ni en las horas y el costo del empleado. Tests en las Tasks 2 y 3.
3. **Los bordes del mes:** un gasto del día 31 entra en su mes, y uno del 1 del mes siguiente no. Test en la Task 2.
4. **Horas con decimales o inválidas** (`4,5`, `0`, `25`, texto): el formulario convierte la coma y el esquema rechaza 0 y más de 24 h. Tests en las Tasks 1 y 4.
5. **Cargar horas a un empleado inactivo** se rechaza con un mensaje claro, sin insertar nada. Test en la Task 3.

---

### Task 1: Reglas de dominio y errores

**Files:**
- Create: `src/domain/staff.ts`, `src/domain/staff.test.ts`
- Modify: `src/domain/errors.ts`

**Interfaces:**
- Produces: `hoursToMinutes(hours: number): number`, `shiftCostCents(minutes: number, hourlyRateCents: number): number`, `parseHoursInput(text: string): number | null` (minutos o null) y los códigos `DATE_IN_FUTURE` y `EMPLOYEE_INACTIVE`.

- [ ] **Step 1: test que falla** (`src/domain/staff.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { hoursToMinutes, parseHoursInput, shiftCostCents } from './staff';

describe('staff rules', () => {
  it('turns hours into whole minutes', () => {
    expect(hoursToMinutes(4)).toBe(240);
    expect(hoursToMinutes(4.5)).toBe(270);
    expect(hoursToMinutes(0.33)).toBe(20);
  });

  it('prices a shift from minutes and the hourly rate, rounded to the cent', () => {
    expect(shiftCostCents(240, 500_000)).toBe(2_000_000);
    expect(shiftCostCents(270, 500_000)).toBe(2_250_000);
    expect(shiftCostCents(20, 100)).toBe(33);
    expect(shiftCostCents(60, 0)).toBe(0);
  });

  it('parses hours typed with comma or dot into minutes', () => {
    expect(parseHoursInput('4')).toBe(240);
    expect(parseHoursInput('4,5')).toBe(270);
    expect(parseHoursInput(' 7.25 ')).toBe(435);
    expect(parseHoursInput('')).toBeNull();
    expect(parseHoursInput('abc')).toBeNull();
    expect(parseHoursInput('-2')).toBeNull();
  });
});
```

- [ ] **Step 2: verificar que falla.** Correr `npm test -- src/domain/staff.test.ts`. Se espera FAIL porque no existe `./staff`.

- [ ] **Step 3: implementación** (`src/domain/staff.ts`)

```ts
const HOURS_PATTERN = /^\d+([.,]\d+)?$/;

export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

/** Cost of a shift at the given hourly rate, rounded once to the cent. */
export function shiftCostCents(minutes: number, hourlyRateCents: number): number {
  return Math.round((minutes * hourlyRateCents) / 60);
}

/** "4,5" or "4.5" → 270 minutes; anything that isn't a non-negative number → null. */
export function parseHoursInput(text: string): number | null {
  const cleaned = text.trim();
  if (!HOURS_PATTERN.test(cleaned)) return null;
  return hoursToMinutes(Number(cleaned.replace(',', '.')));
}
```

En `src/domain/errors.ts`, agregar antes de `NOT_FOUND`:

```ts
  DATE_IN_FUTURE: 'La fecha no puede ser posterior a hoy.',
  EMPLOYEE_INACTIVE: 'El empleado está inactivo.',
```

- [ ] **Step 4: verificar que pasa.** Correr `npm test -- src/domain/staff.test.ts`. Se espera PASS.
- [ ] **Step 5: commit** con `git add src/domain/staff.ts src/domain/staff.test.ts src/domain/errors.ts` y el mensaje `feat: hourly shift cost rules`.

---

### Task 2: Migración y gastos (repo y servicio)

**Files:**
- Create: `src/main/db/migrations/006_expenses_staff.ts`, `src/main/repos/expenses.ts`, `src/main/services/expenses.ts`, `src/main/services/expenses.test.ts`
- Modify: `src/main/db/migrations.ts`, `src/main/db/migrations.test.ts`, `src/shared/types.ts` y `src/shared/schemas.ts`

**Interfaces:**
- Produces (types):
  - `ExpenseCategory = 'rent' | 'electricity' | 'gas' | 'water' | 'internet' | 'taxes' | 'maintenance' | 'other'`
  - `Expense { id, category, description: string | null, amountCents, method: PaymentMethod, paidAt, recordedAt, voidedAt: string | null }`
  - `ExpenseMonth { expenses: Expense[]; totalCents: number; byCategory: { category: ExpenseCategory; cents: number }[] }`
- Produces (schemas): `expenseCategorySchema`, `expenseInput`, `monthInput = { month: 'YYYY-MM' }` y los tipos `ExpenseInput` y `MonthInput`.
- Produces (repo): `monthBounds(month)`, `insertExpense`, `findExpense`, `listExpensesInMonth` y `voidExpenseRow`.
- Produces (servicio): `createExpense(ctx, input): Expense`, `voidExpense(ctx, id): Expense` y `getExpenseMonth(ctx, month): ExpenseMonth`.

- [ ] **Step 1: tests que fallan.**

En `migrations.test.ts`, agregar:

```ts
  it('rejects invalid expenses and shifts at the database level', () => {
    const db = openDatabase(':memory:');
    const expense = db.prepare(
      "INSERT INTO expenses (category, amount_cents, method, paid_at, recorded_at) VALUES (?, ?, 'cash', '2026-10-05', 'x')",
    );
    expense.run('rent', 100);
    expect(() => expense.run('groceries', 100)).toThrow(/CHECK/);
    expect(() => expense.run('rent', 0)).toThrow(/CHECK/);
    db.prepare("INSERT INTO employees (first_name, last_name, kind, hourly_rate_cents) VALUES ('Ana', 'Roca', 'staff', 500)").run();
    expect(() =>
      db.prepare("INSERT INTO employees (first_name, last_name, kind, hourly_rate_cents) VALUES ('Ana', 'Roca', 'boss', 500)").run(),
    ).toThrow(/CHECK/);
    const shift = db.prepare(
      "INSERT INTO work_shifts (employee_id, worked_on, minutes, hourly_rate_cents, cost_cents, recorded_at) VALUES (?, '2026-10-05', ?, 500, 0, 'x')",
    );
    shift.run(1, 60);
    expect(() => shift.run(1, 0)).toThrow(/CHECK/);
    expect(() => shift.run(1, 1441)).toThrow(/CHECK/);
    expect(() => shift.run(99, 60)).toThrow(/FOREIGN KEY/);
  });
```

Crear `src/main/services/expenses.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { ExpenseInput } from '../../shared/schemas';
import { expectDomainError } from '../../test/helpers';
import { createTestContext, type TestContext } from '../test-context';
import { createExpense, getExpenseMonth, voidExpense } from './expenses';

const rent: ExpenseInput = { category: 'rent', description: 'Octubre', amountCents: 50_000_000, method: 'transfer', paidAt: '2026-10-01' };

describe('expenses', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext(); // hoy: 2026-10-05
  });

  it('records an expense with the time it was entered', () => {
    expect(createExpense(ctx, rent)).toEqual({
      id: expect.any(Number),
      ...rent,
      recordedAt: ctx.clock.now().toISOString(),
      voidedAt: null,
    });
  });

  it('accepts today and rejects future dates', () => {
    expect(createExpense(ctx, { ...rent, paidAt: '2026-10-05' }).paidAt).toBe('2026-10-05');
    expectDomainError(() => createExpense(ctx, { ...rent, paidAt: '2026-10-06' }), 'DATE_IN_FUTURE');
  });

  it('voids an expense once', () => {
    const { id } = createExpense(ctx, rent);
    expect(voidExpense(ctx, id).voidedAt).toBe(ctx.clock.now().toISOString());
    expectDomainError(() => voidExpense(ctx, id), 'ALREADY_VOIDED');
    expectDomainError(() => voidExpense(ctx, 999), 'NOT_FOUND');
  });

  it('sums a month by category, largest first, listing voided ones without counting them', () => {
    createExpense(ctx, { ...rent, paidAt: '2026-09-30' });
    createExpense(ctx, rent);
    createExpense(ctx, { ...rent, category: 'electricity', amountCents: 3_000_000, paidAt: '2026-10-02' });
    createExpense(ctx, { ...rent, category: 'electricity', amountCents: 1_000_000, paidAt: '2026-10-03' });
    const voided = createExpense(ctx, { ...rent, category: 'gas', amountCents: 9_000_000, paidAt: '2026-10-04' });
    voidExpense(ctx, voided.id);

    const month = getExpenseMonth(ctx, '2026-10');
    expect(month.expenses.map((expense) => expense.paidAt)).toEqual(['2026-10-04', '2026-10-03', '2026-10-02', '2026-10-01']);
    expect(month.totalCents).toBe(54_000_000);
    expect(month.byCategory).toEqual([
      { category: 'rent', cents: 50_000_000 },
      { category: 'electricity', cents: 4_000_000 },
    ]);
    expect(getExpenseMonth(ctx, '2026-09').totalCents).toBe(50_000_000);
  });

  it('includes the 31st and leaves out the 1st of the next month', () => {
    ctx.clock.set(new Date(2026, 11, 15, 12));
    createExpense(ctx, { ...rent, paidAt: '2026-10-31' });
    createExpense(ctx, { ...rent, paidAt: '2026-11-01' });
    expect(getExpenseMonth(ctx, '2026-10').expenses).toHaveLength(1);
  });
});
```

- [ ] **Step 2: verificar que falla.** Correr `npm test -- src/main/db/migrations.test.ts src/main/services/expenses.test.ts`. Se espera FAIL porque las tablas y el módulo no existen.

- [ ] **Step 3: implementación.**

`src/main/db/migrations/006_expenses_staff.ts`: exporta `migration006` con el SQL de la spec, sin cambios. En `migrations.ts`, se importa y se agrega a `MIGRATIONS`.

En `src/shared/types.ts`, agregar al final:

```ts
export type ExpenseCategory = 'rent' | 'electricity' | 'gas' | 'water' | 'internet' | 'taxes' | 'maintenance' | 'other';

/** A fixed cost of the local (rent, utilities, ...). Kiosk stock is not an expense: its cost goes with each sale. */
export interface Expense {
  id: number;
  category: ExpenseCategory;
  description: string | null;
  amountCents: number;
  method: PaymentMethod;
  paidAt: string;
  recordedAt: string;
  voidedAt: string | null;
}

export interface ExpenseMonth {
  /** Voided ones included, newest first. */
  expenses: Expense[];
  /** Non-voided only. */
  totalCents: number;
  /** Non-voided only, largest first. */
  byCategory: { category: ExpenseCategory; cents: number }[];
}
```

En `src/shared/schemas.ts`, después de `paymentMethodSchema`, agregar:

```ts
export const expenseCategorySchema = z.enum(['rent', 'electricity', 'gas', 'water', 'internet', 'taxes', 'maintenance', 'other']);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes inválido');
```

Después de `counterSellInput`, agregar:

```ts
export const monthInput = z.object({ month });
export const expenseInput = z.object({
  category: expenseCategorySchema,
  description: optionalText(200),
  amountCents: positiveCents,
  method: paymentMethodSchema,
  paidAt: isoDate,
});
```

Y en los tipos:

```ts
export type MonthInput = z.infer<typeof monthInput>;
export type ExpenseInput = z.infer<typeof expenseInput>;
```

`src/main/repos/expenses.ts`:

```ts
import type { ExpenseInput } from '../../shared/schemas';
import type { Expense } from '../../shared/types';
import type { Db } from '../db/connection';

const COLUMNS = `id, category, description, amount_cents AS amountCents, method, paid_at AS paidAt,
  recorded_at AS recordedAt, voided_at AS voidedAt`;

/** First and last possible ISO dates of a 'YYYY-MM' month; '-31' also covers shorter months as text. */
export function monthBounds(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${month}-31` };
}

export function insertExpense(db: Db, expense: ExpenseInput & { recordedAt: string }): number {
  const result = db
    .prepare(
      `INSERT INTO expenses (category, description, amount_cents, method, paid_at, recorded_at)
       VALUES (@category, @description, @amountCents, @method, @paidAt, @recordedAt)`,
    )
    .run(expense);
  return Number(result.lastInsertRowid);
}

export function findExpense(db: Db, id: number): Expense | undefined {
  return db.prepare<[number], Expense>(`SELECT ${COLUMNS} FROM expenses WHERE id = ?`).get(id);
}

export function listExpensesInMonth(db: Db, month: string): Expense[] {
  return db
    .prepare<[{ from: string; to: string }], Expense>(
      `SELECT ${COLUMNS} FROM expenses WHERE paid_at BETWEEN @from AND @to ORDER BY paid_at DESC, id DESC`,
    )
    .all(monthBounds(month));
}

export function voidExpenseRow(db: Db, id: number, now: string): void {
  db.prepare('UPDATE expenses SET voided_at = ? WHERE id = ?').run(now, id);
}
```

`src/main/services/expenses.ts`:

```ts
import { DomainError } from '../../domain/errors';
import type { ExpenseInput } from '../../shared/schemas';
import type { Expense, ExpenseCategory, ExpenseMonth } from '../../shared/types';
import { type Context, nowIso, today } from '../context';
import * as repo from '../repos/expenses';

function getExpense(ctx: Context, id: number): Expense {
  const expense = repo.findExpense(ctx.db, id);
  if (!expense) throw new DomainError('NOT_FOUND');
  return expense;
}

export function createExpense(ctx: Context, input: ExpenseInput): Expense {
  if (input.paidAt > today(ctx)) throw new DomainError('DATE_IN_FUTURE');
  return getExpense(ctx, repo.insertExpense(ctx.db, { ...input, recordedAt: nowIso(ctx) }));
}

export function voidExpense(ctx: Context, id: number): Expense {
  if (getExpense(ctx, id).voidedAt) throw new DomainError('ALREADY_VOIDED');
  repo.voidExpenseRow(ctx.db, id, nowIso(ctx));
  return getExpense(ctx, id);
}

export function getExpenseMonth(ctx: Context, month: string): ExpenseMonth {
  const expenses = repo.listExpensesInMonth(ctx.db, month);
  const byCategory = new Map<ExpenseCategory, number>();
  for (const expense of expenses) {
    if (!expense.voidedAt) byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amountCents);
  }
  return {
    expenses,
    totalCents: [...byCategory.values()].reduce((total, cents) => total + cents, 0),
    byCategory: [...byCategory].map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents),
  };
}
```

- [ ] **Step 4: verificar que pasa.** Correr `npm test -- src/main/db/migrations.test.ts src/main/services/expenses.test.ts`. Se espera PASS.
- [ ] **Step 5: commit** con `git add src/main/db src/main/repos/expenses.ts src/main/services/expenses.ts src/main/services/expenses.test.ts src/shared` y el mensaje `feat: expenses table, repo and service`.

---

### Task 3: Empleados y turnos (repo y servicio)

**Files:**
- Create: `src/main/repos/employees.ts`, `src/main/repos/shifts.ts`, `src/main/services/employees.ts`, `src/main/services/employees.test.ts`
- Modify: `src/shared/types.ts`, `src/shared/schemas.ts`

**Interfaces:**
- Consumes: `shiftCostCents` (Task 1), `monthBounds` (Task 2).
- Produces (types):
  - `EmployeeKind = 'staff' | 'casual'`
  - `Employee { id, firstName, lastName, dni, phone, address, kind, hourlyRateCents, active: boolean }`
  - `EmployeeSummary = Employee & { monthMinutes: number; monthCostCents: number }`
  - `WorkShift { id, employeeId, employeeName, workedOn, minutes, hourlyRateCents, costCents, note, recordedAt, voidedAt }`
  - `StaffStats { active, staff, casual, monthMinutes, monthCostCents }`
- Produces (schemas): `employeeInput`, `employeeUpdate`, `employeeListInput = { includeInactive = false, month }`, `shiftListInput = { month, employeeId? }`, `shiftInput = { employeeId, workedOn, minutes, note }` y sus tipos.
- Produces (servicio):
  - `createEmployee(ctx, input): Employee` y `updateEmployee(ctx, input): Employee`
  - `listEmployees(ctx, includeInactive, month): EmployeeSummary[]`
  - `recordShift(ctx, input): WorkShift` y `voidShift(ctx, id): WorkShift`
  - `listShifts(ctx, month, employeeId: number | null): WorkShift[]`
  - `getStaffStats(ctx, month): StaffStats`

- [ ] **Step 1: test que falla** (`src/main/services/employees.test.ts`)

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { EmployeeInput } from '../../shared/schemas';
import { expectDomainError } from '../../test/helpers';
import { createTestContext, type TestContext } from '../test-context';
import { createEmployee, getStaffStats, listEmployees, listShifts, recordShift, updateEmployee, voidShift } from './employees';

const lucia: EmployeeInput = {
  firstName: 'Lucía',
  lastName: 'Paz',
  dni: null,
  phone: null,
  address: null,
  kind: 'staff',
  hourlyRateCents: 500_000,
  active: true,
};

describe('employees and shifts', () => {
  let ctx: TestContext;
  let luciaId: number;

  beforeEach(() => {
    ctx = createTestContext(); // hoy: 2026-10-05
    luciaId = createEmployee(ctx, lucia).id;
  });

  const shift = (overrides: Partial<{ employeeId: number; workedOn: string; minutes: number }> = {}) =>
    recordShift(ctx, { employeeId: luciaId, workedOn: '2026-10-04', minutes: 270, note: null, ...overrides });

  it('records a shift with a snapshot of the rate and its cost', () => {
    expect(shift()).toEqual({
      id: expect.any(Number),
      employeeId: luciaId,
      employeeName: 'Lucía Paz',
      workedOn: '2026-10-04',
      minutes: 270,
      hourlyRateCents: 500_000,
      costCents: 2_250_000,
      note: null,
      recordedAt: ctx.clock.now().toISOString(),
      voidedAt: null,
    });
  });

  it('keeps old shifts at the old rate when the rate changes', () => {
    shift();
    updateEmployee(ctx, { ...lucia, id: luciaId, hourlyRateCents: 600_000 });
    shift({ minutes: 60 });
    expect(listShifts(ctx, '2026-10', null).map((row) => row.costCents)).toEqual([600_000, 2_250_000]);
  });

  it('rejects future dates, inactive and unknown employees without inserting', () => {
    expectDomainError(() => shift({ workedOn: '2026-10-06' }), 'DATE_IN_FUTURE');
    expectDomainError(() => shift({ employeeId: 999 }), 'NOT_FOUND');
    updateEmployee(ctx, { ...lucia, id: luciaId, active: false });
    expectDomainError(() => shift(), 'EMPLOYEE_INACTIVE');
    expect(listShifts(ctx, '2026-10', null)).toEqual([]);
  });

  it('voids a shift once', () => {
    const { id } = shift();
    expect(voidShift(ctx, id).voidedAt).toBe(ctx.clock.now().toISOString());
    expectDomainError(() => voidShift(ctx, id), 'ALREADY_VOIDED');
    expectDomainError(() => voidShift(ctx, 999), 'NOT_FOUND');
  });

  it('adds up hours and cost of the month per employee, without voided shifts', () => {
    const marcosId = createEmployee(ctx, { ...lucia, firstName: 'Marcos', kind: 'casual', hourlyRateCents: 300_000 }).id;
    createEmployee(ctx, { ...lucia, firstName: 'Eva', active: false });
    shift();
    shift({ workedOn: '2026-09-30', minutes: 60 });
    voidShift(ctx, shift({ minutes: 600 }).id);
    shift({ employeeId: marcosId, minutes: 120 });

    expect(listEmployees(ctx, false, '2026-10').map(({ firstName, monthMinutes, monthCostCents }) => [firstName, monthMinutes, monthCostCents])).toEqual([
      ['Lucía', 270, 2_250_000],
      ['Marcos', 120, 600_000],
    ]);
    expect(listEmployees(ctx, true, '2026-10')).toHaveLength(3);
    expect(listShifts(ctx, '2026-10', marcosId)).toHaveLength(1);
    expect(getStaffStats(ctx, '2026-10')).toEqual({ active: 2, staff: 1, casual: 1, monthMinutes: 390, monthCostCents: 2_850_000 });
  });

  it('fails on unknown employees when updating', () => {
    expectDomainError(() => updateEmployee(ctx, { ...lucia, id: 999 }), 'NOT_FOUND');
  });
});
```

- [ ] **Step 2: verificar que falla.** Correr `npm test -- src/main/services/employees.test.ts`. Se espera FAIL porque el módulo no existe.

- [ ] **Step 3: implementación.**

En `src/shared/types.ts`:

```ts
/** Every employee is paid by the hour; staff/casual is only a label. */
export type EmployeeKind = 'staff' | 'casual';

export interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  dni: string | null;
  phone: string | null;
  address: string | null;
  kind: EmployeeKind;
  hourlyRateCents: number;
  active: boolean;
}

export interface EmployeeSummary extends Employee {
  /** Non-voided shifts of the requested month. */
  monthMinutes: number;
  monthCostCents: number;
}

export interface WorkShift {
  id: number;
  employeeId: number;
  employeeName: string;
  workedOn: string;
  minutes: number;
  /** Snapshots taken when the shift was recorded. */
  hourlyRateCents: number;
  costCents: number;
  note: string | null;
  recordedAt: string;
  voidedAt: string | null;
}

export interface StaffStats {
  /** Active employees, and how many of them are staff or casual. */
  active: number;
  staff: number;
  casual: number;
  /** Non-voided shifts of the month, any employee. */
  monthMinutes: number;
  monthCostCents: number;
}
```

En `src/shared/schemas.ts`:

```ts
const employeeFields = {
  firstName: personName,
  lastName: personName,
  dni: optionalText(20),
  phone: optionalText(30),
  address: optionalText(200),
  kind: z.enum(['staff', 'casual']),
  hourlyRateCents: cents,
  active: z.boolean(),
};
export const employeeInput = z.object(employeeFields);
export const employeeUpdate = z.object({ id, ...employeeFields });
export const employeeListInput = z.object({ includeInactive: z.boolean().default(false), month });
export const shiftListInput = z.object({ month, employeeId: id.optional() });
export const shiftInput = z.object({
  employeeId: id,
  workedOn: isoDate,
  minutes: z.number().int().min(1, 'Cargá al menos un minuto').max(1440, 'Un turno no puede pasar de 24 horas'),
  note: optionalText(200),
});
```

Y en los tipos:

```ts
export type EmployeeInput = z.infer<typeof employeeInput>;
export type EmployeeUpdate = z.infer<typeof employeeUpdate>;
export type ShiftInput = z.infer<typeof shiftInput>;
```

`src/main/repos/employees.ts`:

```ts
import type { EmployeeInput } from '../../shared/schemas';
import type { Employee } from '../../shared/types';
import type { Db } from '../db/connection';

type EmployeeRow = Omit<Employee, 'active'> & { active: number };

const COLUMNS = `id, first_name AS firstName, last_name AS lastName, dni, phone, address, kind,
  hourly_rate_cents AS hourlyRateCents, active`;

const toEmployee = (row: EmployeeRow): Employee => ({ ...row, active: row.active === 1 });
const params = (fields: EmployeeInput) => ({ ...fields, active: fields.active ? 1 : 0 });

export function insertEmployee(db: Db, fields: EmployeeInput): number {
  const result = db
    .prepare(
      `INSERT INTO employees (first_name, last_name, dni, phone, address, kind, hourly_rate_cents, active)
       VALUES (@firstName, @lastName, @dni, @phone, @address, @kind, @hourlyRateCents, @active)`,
    )
    .run(params(fields));
  return Number(result.lastInsertRowid);
}

export function updateEmployeeRow(db: Db, id: number, fields: EmployeeInput): void {
  db.prepare(
    `UPDATE employees SET first_name = @firstName, last_name = @lastName, dni = @dni, phone = @phone, address = @address,
       kind = @kind, hourly_rate_cents = @hourlyRateCents, active = @active
     WHERE id = @id`,
  ).run({ ...params(fields), id });
}

export function findEmployee(db: Db, id: number): Employee | undefined {
  const row = db.prepare<[number], EmployeeRow>(`SELECT ${COLUMNS} FROM employees WHERE id = ?`).get(id);
  return row && toEmployee(row);
}

export function listEmployeeRows(db: Db, includeInactive: boolean): Employee[] {
  return db
    .prepare<[number], EmployeeRow>(
      `SELECT ${COLUMNS} FROM employees WHERE active = 1 OR ? = 1
       ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE`,
    )
    .all(includeInactive ? 1 : 0)
    .map(toEmployee);
}
```

`src/main/repos/shifts.ts`:

```ts
import type { WorkShift } from '../../shared/types';
import type { Db } from '../db/connection';
import { monthBounds } from './expenses';

export interface NewShift {
  employeeId: number;
  workedOn: string;
  minutes: number;
  hourlyRateCents: number;
  costCents: number;
  note: string | null;
  recordedAt: string;
}

export interface ShiftTotals {
  employeeId: number;
  minutes: number;
  costCents: number;
}

const SELECT = `SELECT w.id, w.employee_id AS employeeId, e.first_name || ' ' || e.last_name AS employeeName,
    w.worked_on AS workedOn, w.minutes, w.hourly_rate_cents AS hourlyRateCents, w.cost_cents AS costCents, w.note,
    w.recorded_at AS recordedAt, w.voided_at AS voidedAt
  FROM work_shifts w JOIN employees e ON e.id = w.employee_id`;

export function insertShift(db: Db, shift: NewShift): number {
  const result = db
    .prepare(
      `INSERT INTO work_shifts (employee_id, worked_on, minutes, hourly_rate_cents, cost_cents, note, recorded_at)
       VALUES (@employeeId, @workedOn, @minutes, @hourlyRateCents, @costCents, @note, @recordedAt)`,
    )
    .run(shift);
  return Number(result.lastInsertRowid);
}

export function findShift(db: Db, id: number): WorkShift | undefined {
  return db.prepare<[number], WorkShift>(`${SELECT} WHERE w.id = ?`).get(id);
}

/** Voided ones included, newest first; `employeeId` null means everyone. */
export function listShiftsInMonth(db: Db, month: string, employeeId: number | null): WorkShift[] {
  return db
    .prepare<[{ from: string; to: string; employeeId: number | null }], WorkShift>(
      `${SELECT} WHERE w.worked_on BETWEEN @from AND @to AND (@employeeId IS NULL OR w.employee_id = @employeeId)
       ORDER BY w.worked_on DESC, w.id DESC`,
    )
    .all({ ...monthBounds(month), employeeId });
}

/** Non-voided minutes and cost of the month, per employee. */
export function monthTotals(db: Db, month: string): ShiftTotals[] {
  return db
    .prepare<[{ from: string; to: string }], ShiftTotals>(
      `SELECT employee_id AS employeeId, SUM(minutes) AS minutes, SUM(cost_cents) AS costCents
       FROM work_shifts WHERE voided_at IS NULL AND worked_on BETWEEN @from AND @to GROUP BY employee_id`,
    )
    .all(monthBounds(month));
}

export function voidShiftRow(db: Db, id: number, now: string): void {
  db.prepare('UPDATE work_shifts SET voided_at = ? WHERE id = ?').run(now, id);
}
```

`src/main/services/employees.ts`:

```ts
import { DomainError } from '../../domain/errors';
import { shiftCostCents } from '../../domain/staff';
import type { EmployeeInput, EmployeeUpdate, ShiftInput } from '../../shared/schemas';
import type { Employee, EmployeeSummary, StaffStats, WorkShift } from '../../shared/types';
import { type Context, nowIso, today } from '../context';
import * as employees from '../repos/employees';
import * as shifts from '../repos/shifts';

function getEmployee(ctx: Context, id: number): Employee {
  const employee = employees.findEmployee(ctx.db, id);
  if (!employee) throw new DomainError('NOT_FOUND');
  return employee;
}

function getShift(ctx: Context, id: number): WorkShift {
  const shift = shifts.findShift(ctx.db, id);
  if (!shift) throw new DomainError('NOT_FOUND');
  return shift;
}

export function createEmployee(ctx: Context, input: EmployeeInput): Employee {
  return getEmployee(ctx, employees.insertEmployee(ctx.db, input));
}

export function updateEmployee(ctx: Context, { id, ...input }: EmployeeUpdate): Employee {
  return ctx.db.transaction(() => {
    getEmployee(ctx, id);
    employees.updateEmployeeRow(ctx.db, id, input);
    return getEmployee(ctx, id);
  })();
}

export function listEmployees(ctx: Context, includeInactive: boolean, month: string): EmployeeSummary[] {
  const totals = new Map(shifts.monthTotals(ctx.db, month).map((row) => [row.employeeId, row]));
  return employees.listEmployeeRows(ctx.db, includeInactive).map((employee) => ({
    ...employee,
    monthMinutes: totals.get(employee.id)?.minutes ?? 0,
    monthCostCents: totals.get(employee.id)?.costCents ?? 0,
  }));
}

/** The rate and the cost come from the stored employee, never from the caller. */
export function recordShift(ctx: Context, input: ShiftInput): WorkShift {
  return ctx.db.transaction(() => {
    const employee = getEmployee(ctx, input.employeeId);
    if (!employee.active) throw new DomainError('EMPLOYEE_INACTIVE');
    if (input.workedOn > today(ctx)) throw new DomainError('DATE_IN_FUTURE');
    const id = shifts.insertShift(ctx.db, {
      ...input,
      hourlyRateCents: employee.hourlyRateCents,
      costCents: shiftCostCents(input.minutes, employee.hourlyRateCents),
      recordedAt: nowIso(ctx),
    });
    return getShift(ctx, id);
  })();
}

export function voidShift(ctx: Context, id: number): WorkShift {
  if (getShift(ctx, id).voidedAt) throw new DomainError('ALREADY_VOIDED');
  shifts.voidShiftRow(ctx.db, id, nowIso(ctx));
  return getShift(ctx, id);
}

export function listShifts(ctx: Context, month: string, employeeId: number | null): WorkShift[] {
  return shifts.listShiftsInMonth(ctx.db, month, employeeId);
}

export function getStaffStats(ctx: Context, month: string): StaffStats {
  const active = employees.listEmployeeRows(ctx.db, false);
  const totals = shifts.monthTotals(ctx.db, month);
  return {
    active: active.length,
    staff: active.filter((employee) => employee.kind === 'staff').length,
    casual: active.filter((employee) => employee.kind === 'casual').length,
    monthMinutes: totals.reduce((total, row) => total + row.minutes, 0),
    monthCostCents: totals.reduce((total, row) => total + row.costCents, 0),
  };
}
```

- [ ] **Step 4: verificar que pasa.** Correr `npm test -- src/main/services/employees.test.ts`. Se espera PASS.
- [ ] **Step 5: commit** con `git add src/main/repos/employees.ts src/main/repos/shifts.ts src/main/services/employees.ts src/main/services/employees.test.ts src/shared` y el mensaje `feat: employees and work shifts repo and service`.

---

### Task 4: Canales IPC y esquemas

**Files:**
- Modify: `src/shared/channels.ts`, `src/shared/api.ts`, `src/main/ipc/handlers.ts` y `src/shared/schemas.test.ts`

**Interfaces:**
- Produces los canales `expenses:month`, `expenses:create`, `expenses:void`, `employees:list`, `employees:create`, `employees:update`, `shifts:month`, `shifts:create`, `shifts:void` y `staff:stats`.

- [ ] **Step 1: test que falla** (`schemas.test.ts`; agregar `monthInput`, `shiftInput` y `expenseInput` al import)

```ts
  it('accepts YYYY-MM months only', () => {
    expect(monthInput.safeParse({ month: '2026-10' }).success).toBe(true);
    expect(monthInput.safeParse({ month: '2026-13' }).success).toBe(false);
    expect(monthInput.safeParse({ month: '10/2026' }).success).toBe(false);
  });

  it('bounds a shift between one minute and 24 hours', () => {
    const base = { employeeId: 1, workedOn: '2026-10-05', note: null };
    expect(shiftInput.safeParse({ ...base, minutes: 0 }).success).toBe(false);
    expect(shiftInput.safeParse({ ...base, minutes: 1441 }).success).toBe(false);
    expect(shiftInput.safeParse({ ...base, minutes: 270 }).success).toBe(true);
  });

  it('rejects unknown expense categories and zero amounts', () => {
    const base = { category: 'rent', description: null, amountCents: 100, method: 'cash', paidAt: '2026-10-05' };
    expect(expenseInput.safeParse(base).success).toBe(true);
    expect(expenseInput.safeParse({ ...base, category: 'groceries' }).success).toBe(false);
    expect(expenseInput.safeParse({ ...base, amountCents: 0 }).success).toBe(false);
  });
```

- [ ] **Step 2: verificar.** Correr `npm test -- src/shared/schemas.test.ts`. Se espera PASS, porque los esquemas ya existen desde las Tasks 2 y 3: este test fija el contrato. Después correr `npm run typecheck`, que todavía tiene que pasar antes del cambio.

- [ ] **Step 3: cableado.**
  - En `channels.ts`, agregar los 10 canales después de `'counter:void'`.
  - En `api.ts`, `apiSchemas`:

```ts
  'expenses:month': schemas.monthInput,
  'expenses:create': schemas.expenseInput,
  'expenses:void': schemas.idInput,
  'employees:list': schemas.employeeListInput,
  'employees:create': schemas.employeeInput,
  'employees:update': schemas.employeeUpdate,
  'shifts:month': schemas.shiftListInput,
  'shifts:create': schemas.shiftInput,
  'shifts:void': schemas.idInput,
  'staff:stats': schemas.monthInput,
```

  - En `ApiOutputs`:

```ts
  'expenses:month': T.ExpenseMonth;
  'expenses:create': T.Expense;
  'expenses:void': T.Expense;
  'employees:list': T.EmployeeSummary[];
  'employees:create': T.Employee;
  'employees:update': T.Employee;
  'shifts:month': T.WorkShift[];
  'shifts:create': T.WorkShift;
  'shifts:void': T.WorkShift;
  'staff:stats': T.StaffStats;
```

  - En `handlers.ts`, importar de `../services/expenses` y `../services/employees` y agregar:

```ts
    'expenses:month': ({ month }) => getExpenseMonth(ctx, month),
    'expenses:create': (input) => createExpense(ctx, input),
    'expenses:void': ({ id }) => voidExpense(ctx, id),
    'employees:list': ({ includeInactive, month }) => listEmployees(ctx, includeInactive, month),
    'employees:create': (input) => createEmployee(ctx, input),
    'employees:update': (input) => updateEmployee(ctx, input),
    'shifts:month': ({ month, employeeId }) => listShifts(ctx, month, employeeId ?? null),
    'shifts:create': (input) => recordShift(ctx, input),
    'shifts:void': ({ id }) => voidShift(ctx, id),
    'staff:stats': ({ month }) => getStaffStats(ctx, month),
```

- [ ] **Step 4: verificar.** Correr `npm test` y `npm run typecheck`. Se espera PASS en los dos.
- [ ] **Step 5: commit** con `git add src/shared src/main/ipc/handlers.ts` y el mensaje `feat: expenses, employees and shifts channels`.

---

### Task 5: Pantalla de gastos

**Files:**
- Create: `src/renderer/pages/ExpensesPage.tsx`, `src/renderer/pages/ExpenseForm.tsx`
- Modify: `src/renderer/lib/format.ts`, `src/renderer/components/Layout.tsx` y `src/renderer/routes.tsx`

**Interfaces:**
- Produces en `format.ts`:
  - `EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string>`: Alquiler, Luz, Gas, Agua, Internet, Impuestos, Mantenimiento y Otros.
  - `EMPLOYEE_KIND_LABELS: Record<EmployeeKind, string>`: Estable y Ocasional.
  - `formatHours(minutes)`: por ejemplo `270 → "4,5 h"`, con `toLocaleString('es-AR', { maximumFractionDigits: 2 })`.
  - `currentMonthIso()`, que devuelve `todayIso().slice(0, 7)`.

Pasos (es UI, sin unit tests: se verifica con E2E en la Task 8 y revisión visual):

- [ ] **Step 1: helpers de formato.** Agregar los cuatro helpers a `format.ts` y un caso de `formatHours` a `src/renderer/lib/lib.test.ts`:

```ts
  it('formats minutes as hours with comma decimals', () => {
    expect(formatHours(270)).toBe('4,5 h');
    expect(formatHours(60)).toBe('1 h');
  });
```

- [ ] **Step 2: `ExpenseForm.tsx`.** Sigue el patrón de `ProductForm.tsx`. Props: `{ initial: Partial<ExpenseInput> | null; onSaved: () => void; onCancel: () => void }`.
  - Campos:
    - `SelectField` Categoría, con las opciones de `Object.entries(EXPENSE_CATEGORY_LABELS)`; por defecto `rent`.
    - `TextField` Detalle.
    - `MoneyField` Importe, parseado con `parseMoneyInput`; `MONEY_ERROR` si es null.
    - `SelectField` Medio, con `PAYMENT_METHOD_LABELS`; por defecto `cash`.
    - `TextField type="date"` Fecha, con `max={todayIso()}` y `todayIso()` por defecto.
  - Arriba del formulario, la nota `text-sm text-ink-soft`: "La mercadería del kiosco no va acá: su costo se descuenta en cada venta."
  - Valida con `expenseInput.safeParse`, llama a `call('expenses:create', parsed.data)`, muestra los errores con `toFieldErrors` y los del servidor con `Notice tone="error"`. Botones Cancelar y Guardar.
- [ ] **Step 3: `ExpensesPage.tsx`** con el layout de `KioskPage`: `WITH_SUMMARY`, `SUMMARY_TOP` y `SUMMARY_LIST`.
  - `PageHeader title="Gastos"`, con el subtítulo "Alquiler, servicios y otros costos fijos del local." y la acción `Button` "Nuevo gasto".
  - Debajo, `TextField type="month" label="Mes"`, con `currentMonthIso()` por defecto. Cuando hay categoría elegida, `ClearFilter` con su etiqueta.
  - `const data = useAsync(() => call('expenses:month', { month }), [month], { keepPreviousData: true })`.
  - `const staff = useAsync(() => call('staff:stats', { month }), [month])`.
  - Tabla (`tableClass`, `usePage`, `FillerRows`, `PageBar keep`): Fecha (`formatDate`), Categoría, Detalle, Medio, Importe y acciones. Los anulados llevan `text-ink-soft line-through` y el badge Anulado.
    - Acciones: `Button variant="ghost"` "Repetir", que abre el form con `{ ...expense, paidAt: todayIso() }`, y "Anular", con `ConfirmDialog` y el mensaje "Se anula el gasto de {importe} del {fecha}. Deja de contar en el total del mes.".
    - Vacíos: "No hay gastos este mes" y "Ningún gasto de esa categoría".
  - `SummaryTable` con `state={data}`:
    - fila "Total del mes" con `SummaryValue count={formatMoney(totalCents)}`;
    - una fila por `byCategory`, con `onSelect` y `selected` para filtrar;
    - fila "Sueldos del mes" con el valor `staff` (si cargó, `formatMoney(monthCostCents)`; si no, "—") y `onSelect={() => navigate('/empleados')}`.
  - Al guardar o anular: `data.reload()` y `staff.reload()`.
- [ ] **Step 4: navegación.** En `Layout.tsx` (`NAV_ITEMS`), agregar después de Profesores `{ to: '/empleados', label: 'Empleados', end: false }` y `{ to: '/gastos', label: 'Gastos', end: false }`. En `routes.tsx`, agregar `<Route path="gastos" element={<ExpensesPage />} />`. La ruta de empleados se agrega en la Task 6.
- [ ] **Step 5: verificar.** Correr `npm run typecheck && npm run lint && npm test`, después `npm run dev` y revisar la pantalla a mano.
- [ ] **Step 6: commit** con el mensaje `feat: expenses screen with monthly totals by category`.

---

### Task 6: Pantalla de empleados

**Files:**
- Create: `src/renderer/pages/EmployeesPage.tsx`, `src/renderer/pages/EmployeeForm.tsx`, `src/renderer/pages/ShiftForm.tsx`
- Modify: `src/renderer/routes.tsx`

- [ ] **Step 1: `EmployeeForm.tsx`**, con el patrón de `ProductForm`. Props: `{ employee: Employee | null; onSaved; onCancel }`.
  - Campos: Nombre, Apellido, DNI, Teléfono y Dirección (`TextField`); `SelectField` Tipo con `EMPLOYEE_KIND_LABELS`; `MoneyField` Valor hora; `CheckboxField` Activo.
  - `employeeInput.safeParse`, después `employees:create` o `employees:update`.
- [ ] **Step 2: `ShiftForm.tsx`**. Props: `{ employees: Employee[]; employeeId: number | null; onSaved; onCancel }`.
  - Campos:
    - `SelectField` Empleado, solo con los activos.
    - `TextField type="date"` Fecha, con `max={todayIso()}`.
    - `TextField` Horas, con `inputMode="decimal"` y el hint "Por ejemplo 4,5".
    - `TextField` Nota.
  - Las horas se convierten con `parseHoursInput`. Si da null, el error es "Ingresá las horas, por ejemplo 4,5." en el campo `minutes`.
  - Debajo de Horas, en vivo y con `aria-live="polite"`: "Costo estimado {formatMoney(shiftCostCents(minutes, rate))}". El servidor recalcula con la tarifa vigente.
  - `shiftInput.safeParse`, después `shifts:create`.
- [ ] **Step 3: `EmployeesPage.tsx`**, con `WITH_SUMMARY`.
  - `PageHeader title="Empleados"`, con el subtítulo "Cada turno se paga por hora y su costo entra en el balance del mes." y las acciones "Cargar horas" y "Nuevo empleado".
  - Filtros: `TextField type="month"` Mes y `CheckboxField` "Mostrar inactivos".
  - Estado `selectedId: number | null`, que filtra la tabla de turnos. Cuando hay uno, `ClearFilter` con su nombre.
  - Bloque "Equipo": `AsyncView` sobre `employees:list` con `CardGrid` y `Card onSelect={() => setSelectedId(id)}`.
    - Contenido de cada tarjeta: el subtítulo `Valor hora {formatMoney}`, los badges `EMPLOYEE_KIND_LABELS[kind]` e Inactivo, y un `<dl>` con dos `Stat`: Horas del mes y Costo del mes.
    - Acciones: "Cargar horas" (abre `ShiftForm` con ese empleado) y "Editar".
    - Vacío: `EmptyState` "Todavía no hay empleados", con el botón Nuevo empleado.
  - Bloque "Turnos", con `Stripe` antes y `STICKY_HEADING`: tabla con Fecha, Empleado, Horas (`formatHours`), Valor hora, Costo, Nota y Anular (`ConfirmDialog`). Los anulados van tachados. Vacío: "No hay turnos cargados este mes".
  - `SummaryTable` con `staff:stats`: Activos, Estables, Ocasionales, "Horas del mes" (`formatHours`) y "Costo del mes" (`formatMoney`).
  - Al guardar o anular, recargar empleados, turnos y stats.
- [ ] **Step 4: ruta.** `<Route path="empleados" element={<EmployeesPage />} />`.
- [ ] **Step 5: verificar.** Correr `npm run typecheck && npm run lint && npm test` y revisar con `npm run dev`.
- [ ] **Step 6: commit** con el mensaje `feat: employees screen with shifts and monthly cost`.

---

### Task 7: Datos de prueba

**Files:**
- Modify: `src/main/seedVolume.ts`, `src/main/seed.test.ts`

- [ ] **Step 1: test que falla** (`seed.test.ts`; importar `getExpenseMonth` y `getStaffStats`)

```ts
  it('loads two months of expenses and employee shifts', () => {
    for (const month of ['2026-09', '2026-10']) {
      expect(getExpenseMonth(ctx, month).byCategory.map((row) => row.category)).toContain('rent');
      expect(getStaffStats(ctx, month).monthCostCents).toBeGreaterThan(0);
    }
    expect(getStaffStats(ctx, '2026-10')).toMatchObject({ active: 3, staff: 2, casual: 1 });
  });
```

- [ ] **Step 2: verificar que falla.** Correr `npm test -- src/main/seed.test.ts`. Se espera FAIL.
- [ ] **Step 3: implementación**, al final de `seedVolume` y a través de los servicios:
  - 3 empleados:
    - Lucía Paz, estable, $5.000 por hora;
    - Bruno Díaz, estable, $5.000 por hora;
    - Nico Ferro, ocasional, $4.000 por hora.
  - Turnos de los últimos 60 días, hasta ayer. Los estables trabajan de lunes a sábado: Lucía 4 a 6 h y Bruno 3 a 5 h, en pasos de media hora. Nico trabaja los sábados con un 50 % de probabilidad.
  - Gastos de los dos meses, el día 1 a 10 de cada mes, sin pasarse de hoy:
    - alquiler $450.000 por transferencia;
    - luz $60.000 a $90.000;
    - gas $25.000 a $50.000;
    - internet $18.000;
    - en un mes, mantenimiento $35.000 ("Cambio de presas").
  - Se usan `at(daysAgo, hour)` y `rng`, como el resto del archivo.
- [ ] **Step 4: verificar que pasa.** Correr `npm test -- src/main/seed.test.ts`. Se espera PASS.
- [ ] **Step 5: commit** con el mensaje `feat: seed employees, shifts and two months of expenses`.

---

### Task 8: E2E

**Files:**
- Create: `e2e/expenses-staff.spec.ts`

- [ ] **Step 1: test**, con el mismo arranque que `e2e/kiosk.spec.ts`.

```ts
test('record an expense, repeat it and void the copy', async () => {
  await page.getByRole('navigation').getByRole('link', { name: 'Gastos' }).click();
  await page.getByRole('button', { name: 'Nuevo gasto' }).click();
  await label('Categoría').selectOption('rent');
  await label('Detalle').fill('Octubre');
  await label('Importe').fill('450.000');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('row', { name: /Alquiler.*Octubre/ })).toBeVisible();
  await expect(page.getByRole('complementary')).toContainText(/\$\s450\.000,00/);

  await page.getByRole('button', { name: 'Repetir' }).first().click();
  await expect(label('Importe')).toHaveValue('450.000,00');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('complementary')).toContainText(/\$\s900\.000,00/);

  await page.getByRole('button', { name: 'Anular' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Anular gasto' }).click();
  await expect(page.getByRole('complementary')).toContainText(/\$\s450\.000,00/);
});

test('add an employee and record a shift', async () => {
  await page.getByRole('navigation').getByRole('link', { name: 'Empleados' }).click();
  await page.getByRole('button', { name: 'Nuevo empleado' }).click();
  await label('Nombre').fill('Lucía');
  await label('Apellido').fill('Paz');
  await label('Valor hora').fill('5.000');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();

  await page.getByRole('button', { name: 'Cargar horas' }).first().click();
  await label('Horas').fill('4,5');
  await expect(page.getByText(/Costo estimado \$\s22\.500,00/)).toBeVisible();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('row', { name: /Lucía Paz.*4,5 h/ })).toBeVisible();
  await expect(page.getByRole('complementary')).toContainText(/\$\s22\.500,00/);
});
```

- [ ] **Step 2: correr** `npm run test:e2e`. Se espera PASS en los 3 archivos. Si un selector no coincide con el texto real de la UI, se ajusta el selector, no la UI, salvo que el texto de la UI esté mal.
- [ ] **Step 3: commit** con el mensaje `test: cover expenses and employees end to end`.

---

### Task 9: Cierre

- [ ] `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:e2e` y `npm run audit`, todos en verde.
- [ ] `gitleaks detect --no-banner`, si está instalado.
- [ ] `npm run seed` y revisión visual de `/gastos` y `/empleados` en modo claro y oscuro: vacío, cargando, error y con datos.
- [ ] Actualizar la memoria `subprojects-progress.md`: el subproyecto 3 está hecho en `feat/expenses-staff`.
