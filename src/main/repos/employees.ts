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
