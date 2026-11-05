import type { PaymentMethod, StaffPayout } from '../../shared/types';
import type { Db } from '../db/connection';

export interface NewStaffPayout {
  employeeId: number;
  paidAt: string;
  amountCents: number;
  method: PaymentMethod;
  recordedAt: string;
}

const SELECT = `SELECT id, employee_id AS employeeId, paid_at AS paidAt, amount_cents AS amountCents, method, voided_at AS voidedAt
  FROM staff_payouts`;

export function insertStaffPayout(db: Db, payout: NewStaffPayout): number {
  const result = db
    .prepare(
      `INSERT INTO staff_payouts (employee_id, paid_at, amount_cents, method, recorded_at)
       VALUES (@employeeId, @paidAt, @amountCents, @method, @recordedAt)`,
    )
    .run(payout);
  return Number(result.lastInsertRowid);
}

export function findStaffPayout(db: Db, id: number): StaffPayout | undefined {
  return db.prepare<[number], StaffPayout>(`${SELECT} WHERE id = ?`).get(id);
}

export function listStaffPayouts(db: Db, employeeId: number): StaffPayout[] {
  return db.prepare<[number], StaffPayout>(`${SELECT} WHERE employee_id = ? ORDER BY paid_at DESC, id DESC`).all(employeeId);
}

export function voidStaffPayoutRow(db: Db, id: number, now: string): void {
  db.prepare('UPDATE staff_payouts SET voided_at = ? WHERE id = ?').run(now, id);
}
