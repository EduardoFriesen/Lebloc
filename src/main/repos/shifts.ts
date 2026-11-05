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

export interface PendingTotals {
  employeeId: number;
  cents: number;
  /** Date of the oldest unpaid shift. */
  since: string;
}

interface ShiftRange {
  employeeId: number;
  from: string;
  to: string;
}

const UNPAID = 'w.voided_at IS NULL AND w.payout_id IS NULL';
const UNPAID_IN_RANGE = `w.employee_id = @employeeId AND ${UNPAID} AND w.worked_on BETWEEN @from AND @to`;

const SELECT = `SELECT w.id, w.employee_id AS employeeId, trim(e.first_name || ' ' || e.last_name) AS employeeName,
    w.worked_on AS workedOn, w.minutes, w.hourly_rate_cents AS hourlyRateCents, w.cost_cents AS costCents, w.note,
    w.recorded_at AS recordedAt, w.voided_at AS voidedAt, w.payout_id AS payoutId
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

/** Non-voided, unpaid shifts of one employee between two dates (inclusive), oldest first. */
export function listUnpaidShifts(db: Db, range: ShiftRange): WorkShift[] {
  return db.prepare<[ShiftRange], WorkShift>(`${SELECT} WHERE ${UNPAID_IN_RANGE} ORDER BY w.worked_on, w.id`).all(range);
}

/** Marks the same shifts `listUnpaidShifts` returns as paid by the payout. */
export function payShifts(db: Db, range: ShiftRange, payoutId: number): void {
  db.prepare(`UPDATE work_shifts AS w SET payout_id = @payoutId WHERE ${UNPAID_IN_RANGE}`).run({ ...range, payoutId });
}

export function unpayShifts(db: Db, payoutId: number): void {
  db.prepare('UPDATE work_shifts SET payout_id = NULL WHERE payout_id = ?').run(payoutId);
}

/** What is owed to each employee with unpaid shifts, of any month. */
export function pendingTotals(db: Db): PendingTotals[] {
  return db
    .prepare<[], PendingTotals>(
      `SELECT employee_id AS employeeId, SUM(cost_cents) AS cents, MIN(worked_on) AS since
       FROM work_shifts AS w WHERE ${UNPAID} GROUP BY employee_id`,
    )
    .all();
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
