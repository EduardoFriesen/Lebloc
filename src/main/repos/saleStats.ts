import type { Enrollment } from '../../shared/types';
import type { Db } from '../db/connection';

// Aggregates per non-voided sale. Use as `WITH ${SALE_STATS_CTE} SELECT ... FROM sale_stats`.
export const SALE_STATS_CTE = `sale_stats AS (
  SELECT
    s.id, s.client_id, s.plan_id, s.teacher_id, s.sold_at, s.plan_name, s.free_passes, s.teacher_passes, s.total_cents,
    COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.sale_id = s.id AND p.voided_at IS NULL), 0) AS paid_cents,
    (SELECT COUNT(*) FROM consumptions c WHERE c.sale_id = s.id AND c.voided_at IS NULL AND c.kind = 'free') AS used_free,
    (SELECT COUNT(*) FROM consumptions c WHERE c.sale_id = s.id AND c.voided_at IS NULL AND c.kind = 'teacher') AS used_teacher
  FROM sales s
  WHERE s.voided_at IS NULL
)`;

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export type EnrollmentRow = Omit<Enrollment, 'passStatus'>;

/** Active sales sold on or after `from` (ISO date) of one plan or one teacher, for active clients, newest first. */
export function listMonthEnrollments(db: Db, filter: { planId?: number; teacherId?: number; from: string }): EnrollmentRow[] {
  return db
    .prepare<[{ planId: number | null; teacherId: number | null; from: string }], EnrollmentRow>(
      `WITH ${SALE_STATS_CTE}
       SELECT ss.id AS saleId, c.id AS clientId, c.first_name || ' ' || c.last_name AS clientName,
         ss.plan_name AS planName, t.first_name || ' ' || t.last_name AS teacherName, ss.sold_at AS soldAt,
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
