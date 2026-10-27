import type { PaymentMethod, TeacherPayout, TeacherShare } from '../../shared/types';
import type { Db } from '../db/connection';
import { SALE_STATS_CTE } from './saleStats';

export interface NewPayout {
  teacherId: number;
  paidAt: string;
  amountCents: number;
  method: PaymentMethod;
  note: string | null;
}

export interface BalanceRow {
  teacherId: number;
  teacherName: string;
  earnedCents: number;
  paidOutCents: number;
  pendingClasses: number;
}

const PAYOUT_COLUMNS = `id, teacher_id AS teacherId, paid_at AS paidAt, amount_cents AS amountCents, method, note,
  voided_at AS voidedAt`;

// Pending: teacher passes of non-voided sales to active clients that were not used yet.
const BALANCE_SELECT = `WITH ${SALE_STATS_CTE},
  pending AS (
    SELECT ss.teacher_id, SUM(ss.teacher_passes - ss.used_teacher) AS classes
    FROM sale_stats ss JOIN clients c ON c.id = ss.client_id AND c.archived_at IS NULL
    WHERE ss.teacher_id IS NOT NULL
    GROUP BY ss.teacher_id
  )
  SELECT t.id AS teacherId, trim(t.first_name || ' ' || t.last_name) AS teacherName,
    COALESCE((SELECT SUM(p.teacher_cents) FROM payments p JOIN sales s ON s.id = p.sale_id
              WHERE s.teacher_id = t.id AND p.voided_at IS NULL), 0) AS earnedCents,
    COALESCE((SELECT SUM(tp.amount_cents) FROM teacher_payouts tp
              WHERE tp.teacher_id = t.id AND tp.voided_at IS NULL), 0) AS paidOutCents,
    COALESCE(pd.classes, 0) AS pendingClasses
  FROM teachers t
  LEFT JOIN pending pd ON pd.teacher_id = t.id`;

export function insertPayout(db: Db, payout: NewPayout): number {
  const result = db
    .prepare(
      `INSERT INTO teacher_payouts (teacher_id, paid_at, amount_cents, method, note)
       VALUES (@teacherId, @paidAt, @amountCents, @method, @note)`,
    )
    .run({
      teacherId: payout.teacherId,
      paidAt: payout.paidAt,
      amountCents: payout.amountCents,
      method: payout.method,
      note: payout.note,
    });
  return Number(result.lastInsertRowid);
}

export function findPayout(db: Db, id: number): TeacherPayout | undefined {
  return db.prepare<[number], TeacherPayout>(`SELECT ${PAYOUT_COLUMNS} FROM teacher_payouts WHERE id = ?`).get(id);
}

export function listPayoutsForTeacher(db: Db, teacherId: number): TeacherPayout[] {
  return db
    .prepare<[number], TeacherPayout>(
      `SELECT ${PAYOUT_COLUMNS} FROM teacher_payouts WHERE teacher_id = ? ORDER BY paid_at DESC, id DESC`,
    )
    .all(teacherId);
}

export function voidPayout(db: Db, id: number, now: string): void {
  db.prepare('UPDATE teacher_payouts SET voided_at = ? WHERE id = ?').run(now, id);
}

export function listBalanceRows(db: Db): BalanceRow[] {
  return db
    .prepare<[], BalanceRow>(`${BALANCE_SELECT} ORDER BY t.last_name COLLATE NOCASE, t.first_name COLLATE NOCASE`)
    .all();
}

export function findBalanceRow(db: Db, teacherId: number): BalanceRow | undefined {
  return db.prepare<[number], BalanceRow>(`${BALANCE_SELECT} WHERE t.id = ?`).get(teacherId);
}

export function listTeacherShares(db: Db, teacherId: number): TeacherShare[] {
  return db
    .prepare<[number], TeacherShare>(
      `SELECT p.id AS paymentId, s.id AS saleId, p.paid_at AS paidAt,
         trim(c.first_name || ' ' || c.last_name) AS clientName, s.plan_name AS planName, p.teacher_cents AS teacherCents
       FROM payments p
       JOIN sales s ON s.id = p.sale_id
       JOIN clients c ON c.id = s.client_id
       WHERE s.teacher_id = ? AND p.voided_at IS NULL AND p.teacher_cents > 0
       ORDER BY p.paid_at DESC, p.id DESC`,
    )
    .all(teacherId);
}
