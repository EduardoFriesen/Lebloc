import type { Debtor, Enrollment } from '../../shared/types';
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

export function listDebtorRows(db: Db): Omit<Debtor, 'daysSinceSale'>[] {
  return db
    .prepare<[], Omit<Debtor, 'daysSinceSale'>>(
      `WITH ${SALE_STATS_CTE}
       SELECT ss.id AS saleId, c.id AS clientId, c.first_name || ' ' || c.last_name AS clientName,
         ss.plan_name AS planName, ss.sold_at AS soldAt, ss.total_cents AS totalCents,
         ss.total_cents - ss.paid_cents AS debtCents
       FROM sale_stats ss
       JOIN clients c ON c.id = ss.client_id
       WHERE ss.total_cents - ss.paid_cents > 0
       ORDER BY ss.sold_at, ss.id`,
    )
    .all();
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
