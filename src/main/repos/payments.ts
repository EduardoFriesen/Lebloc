import type { Payment, PaymentMethod } from '../../shared/types';
import type { Db } from '../db/connection';

export interface NewPayment {
  saleId: number;
  paidAt: string;
  amountCents: number;
  method: PaymentMethod;
  localCents: number;
  teacherCents: number;
}

const PAYMENT_COLUMNS = `p.id, p.sale_id AS saleId, p.paid_at AS paidAt, p.amount_cents AS amountCents, p.method,
  p.local_cents AS localCents, p.teacher_cents AS teacherCents, p.voided_at AS voidedAt`;

export function insertPayment(db: Db, payment: NewPayment): number {
  const result = db
    .prepare(
      `INSERT INTO payments (sale_id, paid_at, amount_cents, method, local_cents, teacher_cents)
       VALUES (@saleId, @paidAt, @amountCents, @method, @localCents, @teacherCents)`,
    )
    .run({
      saleId: payment.saleId,
      paidAt: payment.paidAt,
      amountCents: payment.amountCents,
      method: payment.method,
      localCents: payment.localCents,
      teacherCents: payment.teacherCents,
    });
  return Number(result.lastInsertRowid);
}

export function findPayment(db: Db, id: number): Payment | undefined {
  return db.prepare<[number], Payment>(`SELECT ${PAYMENT_COLUMNS} FROM payments p WHERE p.id = ?`).get(id);
}

export function listPaymentsForSale(db: Db, saleId: number): Payment[] {
  return db.prepare<[number], Payment>(`SELECT ${PAYMENT_COLUMNS} FROM payments p WHERE p.sale_id = ? ORDER BY p.id`).all(saleId);
}

export function listPaymentsForClient(db: Db, clientId: number): Payment[] {
  return db
    .prepare<[number], Payment>(
      `SELECT ${PAYMENT_COLUMNS} FROM payments p JOIN sales s ON s.id = p.sale_id
       WHERE s.client_id = ? ORDER BY p.paid_at DESC, p.id DESC`,
    )
    .all(clientId);
}

export function activeAllocationTotals(db: Db, saleId: number): { localCents: number; teacherCents: number } {
  const totals = db
    .prepare<[number], { localCents: number; teacherCents: number }>(
      `SELECT COALESCE(SUM(local_cents), 0) AS localCents, COALESCE(SUM(teacher_cents), 0) AS teacherCents
       FROM payments WHERE sale_id = ? AND voided_at IS NULL`,
    )
    .get(saleId);
  return totals ?? { localCents: 0, teacherCents: 0 };
}

export function voidPayment(db: Db, id: number, now: string): void {
  db.prepare('UPDATE payments SET voided_at = ? WHERE id = ?').run(now, id);
}
