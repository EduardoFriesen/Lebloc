import type { Enrollment, PlanSale } from '../../shared/types';
import type { Db } from '../db/connection';

// Aggregates per non-voided sale. Use as `WITH ${SALE_STATS_CTE} SELECT ... FROM sale_stats`.
export const SALE_STATS_CTE = `sale_stats AS (
  SELECT
    s.id, s.client_id, s.plan_id, s.teacher_id, s.sold_at, s.plan_name, s.free_passes, s.teacher_passes, s.total_cents,
    s.teacher_rate_cents,
    COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.sale_id = s.id AND p.voided_at IS NULL), 0) AS paid_cents,
    (SELECT COUNT(*) FROM consumptions c WHERE c.sale_id = s.id AND c.voided_at IS NULL AND c.kind = 'free') AS used_free,
    (SELECT COUNT(*) FROM consumptions c WHERE c.sale_id = s.id AND c.voided_at IS NULL AND c.kind = 'teacher') AS used_teacher
  FROM sales s
  WHERE s.voided_at IS NULL
)`;

export type EnrollmentRow = Omit<Enrollment, 'passStatus'>;

/** Active sales sold on or after `from` (ISO date) of one plan or one teacher, for active clients, newest first. */
export function listMonthEnrollments(db: Db, filter: { planId?: number; teacherId?: number; from: string }): EnrollmentRow[] {
  return db
    .prepare<[{ planId: number | null; teacherId: number | null; from: string }], EnrollmentRow>(
      `WITH ${SALE_STATS_CTE}
       SELECT ss.id AS saleId, c.id AS clientId, trim(c.first_name || ' ' || c.last_name) AS clientName,
         ss.plan_name AS planName, trim(t.first_name || ' ' || t.last_name) AS teacherName, ss.sold_at AS soldAt,
         ss.free_passes - ss.used_free AS remainingFree, ss.teacher_passes - ss.used_teacher AS remainingTeacher,
         ss.total_cents - ss.paid_cents AS debtCents
       FROM sale_stats ss
       JOIN clients c ON c.id = ss.client_id
       LEFT JOIN teachers t ON t.id = ss.teacher_id
       WHERE ss.sold_at >= @from AND c.archived_at IS NULL
         AND (@planId IS NULL OR ss.plan_id = @planId)
         AND (@teacherId IS NULL OR ss.teacher_id = @teacherId)
       ORDER BY ss.sold_at DESC, ss.id DESC`,
    )
    .all({ planId: filter.planId ?? null, teacherId: filter.teacherId ?? null, from: filter.from });
}

/** Non-voided sales between two dates (inclusive), of one plan or all, archived clients included, newest first. */
export function listPlanSales(db: Db, filter: { from: string; to: string; planId: number | null }): PlanSale[] {
  return db
    .prepare<[{ from: string; to: string; planId: number | null }], PlanSale>(
      `WITH ${SALE_STATS_CTE}
       SELECT ss.id AS saleId, ss.sold_at AS soldAt, c.id AS clientId, trim(c.first_name || ' ' || c.last_name) AS clientName,
         ss.plan_name AS planName, trim(t.first_name || ' ' || t.last_name) AS teacherName, ss.total_cents AS totalCents,
         ss.total_cents - ss.paid_cents AS debtCents
       FROM sale_stats ss
       JOIN clients c ON c.id = ss.client_id
       LEFT JOIN teachers t ON t.id = ss.teacher_id
       WHERE ss.sold_at BETWEEN @from AND @to AND (@planId IS NULL OR ss.plan_id = @planId)
       ORDER BY ss.sold_at DESC, ss.id DESC`,
    )
    .all(filter);
}

export interface SummaryCounts {
  activeClients: number;
  debtorCount: number;
  debtTotalCents: number;
}

/** Active (not archived) clients with passes left, and those who owe, with the total owed. */
export function summaryCounts(db: Db): SummaryCounts {
  return db
    .prepare<[], SummaryCounts>(
      `WITH ${SALE_STATS_CTE},
       per_client AS (
         SELECT ss.client_id,
           SUM(ss.free_passes - ss.used_free + ss.teacher_passes - ss.used_teacher) AS passes,
           SUM(ss.total_cents - ss.paid_cents) AS debt
         FROM sale_stats ss
         JOIN clients c ON c.id = ss.client_id AND c.archived_at IS NULL
         GROUP BY ss.client_id
       )
       SELECT COUNT(CASE WHEN passes > 0 THEN 1 END) AS activeClients,
         COUNT(CASE WHEN debt > 0 THEN 1 END) AS debtorCount,
         COALESCE(SUM(CASE WHEN debt > 0 THEN debt END), 0) AS debtTotalCents
       FROM per_client`,
    )
    .get() as SummaryCounts;
}

/** Non-voided sales sold on or after `from` (ISO date), and their local price (no teacher surcharge). */
export function monthSales(db: Db, from: string): { monthSales: number; monthLocalCents: number } {
  return db
    .prepare<[{ from: string }], { monthSales: number; monthLocalCents: number }>(
      `SELECT COUNT(*) AS monthSales, COALESCE(SUM(local_price_cents), 0) AS monthLocalCents
       FROM sales WHERE voided_at IS NULL AND sold_at >= @from`,
    )
    .get({ from }) as { monthSales: number; monthLocalCents: number };
}
