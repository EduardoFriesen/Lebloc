import { saleDebt } from '../../domain/ledger';
import { remainingPasses } from '../../domain/passes';
import type { SaleSnapshot } from '../../domain/sale';
import type { Sale } from '../../shared/types';
import type { Db } from '../db/connection';

type SaleRow = Omit<Sale, 'debtCents' | 'remainingFree' | 'remainingTeacher'> & { usedFree: number; usedTeacher: number };

const SALE_SELECT = `SELECT s.id, s.client_id AS clientId, s.sold_at AS soldAt, s.plan_id AS planId, s.plan_name AS planName,
    s.free_passes AS freePasses, s.teacher_passes AS teacherPasses, s.local_price_cents AS localPriceCents,
    s.teacher_id AS teacherId,
    CASE WHEN t.id IS NULL THEN NULL ELSE t.first_name || ' ' || t.last_name END AS teacherName,
    s.teacher_rate_cents AS teacherRateCents, s.teacher_surcharge_cents AS teacherSurchargeCents,
    s.total_cents AS totalCents, s.split_rule AS splitRule, s.voided_at AS voidedAt,
    COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.sale_id = s.id AND p.voided_at IS NULL), 0) AS paidCents,
    (SELECT COUNT(*) FROM consumptions c WHERE c.sale_id = s.id AND c.voided_at IS NULL AND c.kind = 'free') AS usedFree,
    (SELECT COUNT(*) FROM consumptions c WHERE c.sale_id = s.id AND c.voided_at IS NULL AND c.kind = 'teacher') AS usedTeacher
  FROM sales s
  LEFT JOIN teachers t ON t.id = s.teacher_id`;

function toSale({ usedFree, usedTeacher, ...row }: SaleRow): Sale {
  const remaining = remainingPasses(
    { free: row.freePasses, teacher: row.teacherPasses },
    { free: usedFree, teacher: usedTeacher },
  );
  return {
    ...row,
    debtCents: row.voidedAt ? 0 : saleDebt(row.totalCents, row.paidCents),
    remainingFree: remaining.free,
    remainingTeacher: remaining.teacher,
  };
}

export function insertSale(db: Db, clientId: number, soldAt: string, snapshot: SaleSnapshot): number {
  const result = db
    .prepare(
      `INSERT INTO sales (client_id, plan_id, sold_at, plan_name, free_passes, teacher_passes, local_price_cents,
         teacher_id, teacher_rate_cents, teacher_surcharge_cents, total_cents, split_rule)
       VALUES (@clientId, @planId, @soldAt, @planName, @freePasses, @teacherPasses, @localPriceCents,
         @teacherId, @teacherRateCents, @teacherSurchargeCents, @totalCents, @splitRule)`,
    )
    .run({
      clientId,
      soldAt,
      planId: snapshot.planId,
      planName: snapshot.planName,
      freePasses: snapshot.freePasses,
      teacherPasses: snapshot.teacherPasses,
      localPriceCents: snapshot.localPriceCents,
      teacherId: snapshot.teacherId,
      teacherRateCents: snapshot.teacherRateCents,
      teacherSurchargeCents: snapshot.teacherSurchargeCents,
      totalCents: snapshot.totalCents,
      splitRule: snapshot.splitRule,
    });
  return Number(result.lastInsertRowid);
}

export function findSale(db: Db, id: number): Sale | undefined {
  const row = db.prepare<[number], SaleRow>(`${SALE_SELECT} WHERE s.id = ?`).get(id);
  return row ? toSale(row) : undefined;
}

export function listSalesForClient(db: Db, clientId: number): Sale[] {
  return db
    .prepare<[number], SaleRow>(`${SALE_SELECT} WHERE s.client_id = ? ORDER BY s.sold_at DESC, s.id DESC`)
    .all(clientId)
    .map(toSale);
}

export function countActiveMovements(db: Db, saleId: number): { payments: number; consumptions: number } {
  const counts = db
    .prepare<[number, number], { payments: number; consumptions: number }>(
      `SELECT
         (SELECT COUNT(*) FROM payments WHERE sale_id = ? AND voided_at IS NULL) AS payments,
         (SELECT COUNT(*) FROM consumptions WHERE sale_id = ? AND voided_at IS NULL) AS consumptions`,
    )
    .get(saleId, saleId);
  return counts ?? { payments: 0, consumptions: 0 };
}

export function voidSale(db: Db, id: number, now: string): void {
  db.prepare('UPDATE sales SET voided_at = ? WHERE id = ?').run(now, id);
}
