import type { Debtor, LowPassesAlert } from '../../shared/types';
import type { Db } from '../db/connection';

// Aggregates per non-voided sale. Use as `WITH ${SALE_STATS_CTE} SELECT ... FROM sale_stats`.
export const SALE_STATS_CTE = `sale_stats AS (
  SELECT
    s.id, s.client_id, s.sold_at, s.plan_name, s.free_passes, s.teacher_passes, s.total_cents,
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

export function listClientPassTotals(db: Db): LowPassesAlert[] {
  return db
    .prepare<[], LowPassesAlert>(
      `WITH ${SALE_STATS_CTE}
       SELECT c.id AS clientId, c.first_name || ' ' || c.last_name AS clientName,
         SUM(ss.free_passes - ss.used_free) AS remainingFree,
         SUM(ss.teacher_passes - ss.used_teacher) AS remainingTeacher
       FROM clients c
       JOIN sale_stats ss ON ss.client_id = c.id
       WHERE c.archived_at IS NULL
       GROUP BY c.id
       ORDER BY remainingFree + remainingTeacher, c.last_name COLLATE NOCASE, c.first_name COLLATE NOCASE`,
    )
    .all();
}
