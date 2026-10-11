import { saleDebt } from '../../domain/ledger';
import type { DayMovement, Payment, PaymentMethod } from '../../shared/types';
import type { Db } from '../db/connection';

export interface NewPayment {
  saleId: number;
  paidAt: string;
  amountCents: number;
  method: PaymentMethod;
  localCents: number;
  teacherCents: number;
  recordedAt: string;
}

const PAYMENT_COLUMNS = `p.id, p.sale_id AS saleId, p.paid_at AS paidAt, p.amount_cents AS amountCents, p.method,
  p.local_cents AS localCents, p.teacher_cents AS teacherCents, p.voided_at AS voidedAt`;

export function insertPayment(db: Db, payment: NewPayment): number {
  const result = db
    .prepare(
      `INSERT INTO payments (sale_id, paid_at, amount_cents, method, local_cents, teacher_cents, recorded_at)
       VALUES (@saleId, @paidAt, @amountCents, @method, @localCents, @teacherCents, @recordedAt)`,
    )
    .run({
      saleId: payment.saleId,
      paidAt: payment.paidAt,
      amountCents: payment.amountCents,
      method: payment.method,
      localCents: payment.localCents,
      teacherCents: payment.teacherCents,
      recordedAt: payment.recordedAt,
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

type PlanMovement = Extract<DayMovement, { kind: 'plan' }>;

/** Non-voided payments made on `date`, newest first, with the sale's current debt. */
export function listPaymentsOn(db: Db, date: string): PlanMovement[] {
  return db
    .prepare<[string], Omit<PlanMovement, 'kind' | 'debtCents'> & { paidCents: number; saleVoidedAt: string | null }>(
      `SELECT p.id AS paymentId, c.id AS clientId, c.first_name || ' ' || c.last_name AS clientName,
         s.plan_name AS planName, p.method, p.amount_cents AS amountCents, s.total_cents AS saleTotalCents,
         s.voided_at AS saleVoidedAt, p.recorded_at AS recordedAt,
         COALESCE((SELECT SUM(q.amount_cents) FROM payments q WHERE q.sale_id = s.id AND q.voided_at IS NULL), 0) AS paidCents
       FROM payments p JOIN sales s ON s.id = p.sale_id JOIN clients c ON c.id = s.client_id
       WHERE p.paid_at = ? AND p.voided_at IS NULL ORDER BY p.id DESC`,
    )
    .all(date)
    .map(({ paidCents, saleVoidedAt, ...row }) => ({
      kind: 'plan' as const,
      ...row,
      debtCents: saleVoidedAt ? 0 : saleDebt(row.saleTotalCents, paidCents),
    }));
}
