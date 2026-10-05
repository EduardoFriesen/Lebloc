import type { PlanInput } from '../../shared/schemas';
import type { Plan } from '../../shared/types';
import type { Db } from '../db/connection';

interface PlanRow extends Omit<Plan, 'active'> {
  active: number;
}

const PLAN_COLUMNS = `id, name, free_passes AS freePasses, teacher_passes AS teacherPasses, price_cents AS priceCents, active`;

function toPlan(row: PlanRow): Plan {
  return { ...row, active: row.active === 1 };
}

function planParams(fields: PlanInput) {
  return {
    name: fields.name,
    freePasses: fields.freePasses,
    teacherPasses: fields.teacherPasses,
    priceCents: fields.priceCents,
    active: fields.active ? 1 : 0,
  };
}

export function insertPlan(db: Db, fields: PlanInput): number {
  const result = db
    .prepare(
      `INSERT INTO plans (name, free_passes, teacher_passes, price_cents, active)
       VALUES (@name, @freePasses, @teacherPasses, @priceCents, @active)`,
    )
    .run(planParams(fields));
  return Number(result.lastInsertRowid);
}

export function updatePlan(db: Db, id: number, fields: PlanInput): void {
  db.prepare(
    `UPDATE plans SET name = @name, free_passes = @freePasses, teacher_passes = @teacherPasses,
       price_cents = @priceCents, active = @active
     WHERE id = @id`,
  ).run({ ...planParams(fields), id });
}

export function findPlan(db: Db, id: number): Plan | undefined {
  const row = db.prepare<[number], PlanRow>(`SELECT ${PLAN_COLUMNS} FROM plans WHERE id = ?`).get(id);
  return row ? toPlan(row) : undefined;
}

export function listPlans(db: Db, includeInactive: boolean): Plan[] {
  return db
    .prepare<[number], PlanRow>(
      `SELECT ${PLAN_COLUMNS} FROM plans WHERE (? = 1 OR active = 1) ORDER BY active DESC, name COLLATE NOCASE`,
    )
    .all(includeInactive ? 1 : 0)
    .map(toPlan);
}
