import { saleDebt } from '../../domain/ledger';
import { isExpired, remainingPasses } from '../../domain/passes';
import type { SaleSnapshot } from '../../domain/sale';
import type { Sale } from '../../shared/types';
import type { Db } from '../db/connection';

type SaleRow = Omit<Sale, 'debtCents' | 'remainingFree' | 'remainingTeacher' | 'expired' | 'extendedFrom'> & {
  usedFree: number;
  usedTeacher: number;
  extendedFromPlanName: string | null;
  extendedAt: string | null;
};

const SALE_SELECT = `SELECT s.id, s.client_id AS clientId, s.sold_at AS soldAt, s.plan_id AS planId, s.plan_name AS planName,
    s.free_passes AS freePasses, s.teacher_passes AS teacherPasses, s.local_price_cents AS localPriceCents,
    s.teacher_id AS teacherId,
    CASE WHEN t.id IS NULL THEN NULL ELSE trim(t.first_name || ' ' || t.last_name) END AS teacherName,
    s.teacher_surcharge_cents AS teacherSurchargeCents,
    s.total_cents AS totalCents, s.split_rule AS splitRule, s.voided_at AS voidedAt, s.expires_at AS expiresAt,
    COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.sale_id = s.id AND p.voided_at IS NULL), 0) AS paidCents,
    (SELECT COUNT(*) FROM consumptions c WHERE c.sale_id = s.id AND c.voided_at IS NULL AND c.kind = 'free') AS usedFree,
    (SELECT COUNT(*) FROM consumptions c WHERE c.sale_id = s.id AND c.voided_at IS NULL AND c.kind = 'teacher') AS usedTeacher,
    (SELECT e.from_plan_name FROM sale_extensions e WHERE e.sale_id = s.id ORDER BY e.id DESC LIMIT 1) AS extendedFromPlanName,
    (SELECT e.extended_at FROM sale_extensions e WHERE e.sale_id = s.id ORDER BY e.id DESC LIMIT 1) AS extendedAt
  FROM sales s
  LEFT JOIN teachers t ON t.id = s.teacher_id`;

function toSale({ usedFree, usedTeacher, extendedFromPlanName, extendedAt, ...row }: SaleRow, today: string): Sale {
  const expired = isExpired(row.expiresAt, today);
  const remaining = expired
    ? { free: 0, teacher: 0 }
    : remainingPasses({ free: row.freePasses, teacher: row.teacherPasses }, { free: usedFree, teacher: usedTeacher });
  return {
    ...row,
    expired,
    debtCents: row.voidedAt ? 0 : saleDebt(row.totalCents, row.paidCents),
    remainingFree: remaining.free,
    remainingTeacher: remaining.teacher,
    extendedFrom: extendedFromPlanName === null || extendedAt === null ? null : { planName: extendedFromPlanName, extendedAt },
  };
}

export function insertSale(db: Db, clientId: number, dates: { soldAt: string; expiresAt: string }, snapshot: SaleSnapshot): number {
  const result = db
    .prepare(
      `INSERT INTO sales (client_id, plan_id, sold_at, plan_name, free_passes, teacher_passes, local_price_cents,
         teacher_id, teacher_surcharge_cents, total_cents, split_rule, expires_at)
       VALUES (@clientId, @planId, @soldAt, @planName, @freePasses, @teacherPasses, @localPriceCents,
         @teacherId, @teacherSurchargeCents, @totalCents, @splitRule, @expiresAt)`,
    )
    .run({
      clientId,
      ...dates,
      planId: snapshot.planId,
      planName: snapshot.planName,
      freePasses: snapshot.freePasses,
      teacherPasses: snapshot.teacherPasses,
      localPriceCents: snapshot.localPriceCents,
      teacherId: snapshot.teacherId,
      teacherSurchargeCents: snapshot.teacherSurchargeCents,
      totalCents: snapshot.totalCents,
      splitRule: snapshot.splitRule,
    });
  return Number(result.lastInsertRowid);
}

/** `today` (ISO date) decides whether the sale expired and lost its passes left. */
export function findSale(db: Db, id: number, today: string): Sale | undefined {
  const row = db.prepare<[number], SaleRow>(`${SALE_SELECT} WHERE s.id = ?`).get(id);
  return row ? toSale(row, today) : undefined;
}

export function listSalesForClient(db: Db, clientId: number, today: string): Sale[] {
  return db
    .prepare<[number], SaleRow>(`${SALE_SELECT} WHERE s.client_id = ? ORDER BY s.sold_at DESC, s.id DESC`)
    .all(clientId)
    .map((row) => toSale(row, today));
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

export function updateExpiry(db: Db, id: number, expiresAt: string): void {
  db.prepare('UPDATE sales SET expires_at = ? WHERE id = ?').run(expiresAt, id);
}

export function voidSale(db: Db, id: number, now: string): void {
  db.prepare('UPDATE sales SET voided_at = ? WHERE id = ?').run(now, id);
}

/** Keeps what the sale was before it becomes another plan. */
export function insertExtension(db: Db, from: Sale, extendedAt: string): void {
  db.prepare(
    `INSERT INTO sale_extensions (sale_id, extended_at, from_plan_id, from_plan_name, from_free_passes, from_teacher_passes,
       from_local_price_cents, from_teacher_surcharge_cents, from_split_rule, from_expires_at)
     VALUES (@saleId, @extendedAt, @planId, @planName, @freePasses, @teacherPasses, @localPriceCents, @teacherSurchargeCents,
       @splitRule, @expiresAt)`,
  ).run({
    saleId: from.id,
    extendedAt,
    planId: from.planId,
    planName: from.planName,
    freePasses: from.freePasses,
    teacherPasses: from.teacherPasses,
    localPriceCents: from.localPriceCents,
    teacherSurchargeCents: from.teacherSurchargeCents,
    splitRule: from.splitRule,
    expiresAt: from.expiresAt,
  });
}

/** The sale becomes another plan; its date, payments and consumptions stay. */
export function applySnapshot(db: Db, saleId: number, snapshot: SaleSnapshot, expiresAt: string): void {
  db.prepare(
    `UPDATE sales SET plan_id = @planId, plan_name = @planName, free_passes = @freePasses, teacher_passes = @teacherPasses,
       local_price_cents = @localPriceCents, teacher_id = @teacherId, teacher_surcharge_cents = @teacherSurchargeCents,
       total_cents = @totalCents, split_rule = @splitRule, expires_at = @expiresAt
     WHERE id = @saleId`,
  ).run({ ...snapshot, saleId, expiresAt });
}
