import type { MoneySource } from '../../domain/finance';
import type { DateRange } from '../../domain/periods';
import type { CounterSaleKind, ExpenseCategory, PlanRanking, ProductRanking, TeacherActivity, VisitKind } from '../../shared/types';
import type { Db } from '../db/connection';

// Aggregations for the finance screen. Dates are inclusive ISO days; voided rows never count.

export interface MoneyRow {
  date: string;
  source: MoneySource;
  cents: number;
}

/** Every money movement of the range, summed per day and source. */
export function moneyByDay(db: Db, range: DateRange): MoneyRow[] {
  return db
    .prepare<[DateRange], MoneyRow>(
      `SELECT paid_at AS date, 'plans' AS source, SUM(local_cents) AS cents FROM payments
         WHERE voided_at IS NULL AND paid_at BETWEEN @from AND @to GROUP BY paid_at
       UNION ALL
       SELECT paid_at, 'teacher', SUM(teacher_cents) FROM payments
         WHERE voided_at IS NULL AND paid_at BETWEEN @from AND @to GROUP BY paid_at
       UNION ALL
       SELECT k.sold_at, 'kiosk', SUM(i.quantity * i.unit_price_cents) FROM kiosk_sales k JOIN kiosk_sale_items i ON i.sale_id = k.id
         WHERE k.voided_at IS NULL AND k.sold_at BETWEEN @from AND @to GROUP BY k.sold_at
       UNION ALL
       SELECT k.sold_at, 'kiosk_cost', SUM(i.quantity * i.unit_cost_cents) FROM kiosk_sales k JOIN kiosk_sale_items i ON i.sale_id = k.id
         WHERE k.voided_at IS NULL AND k.sold_at BETWEEN @from AND @to GROUP BY k.sold_at
       UNION ALL
       SELECT sold_at, kind, SUM(price_cents) FROM counter_sales
         WHERE voided_at IS NULL AND sold_at BETWEEN @from AND @to GROUP BY sold_at, kind
       UNION ALL
       SELECT paid_at, 'expenses', SUM(amount_cents) FROM expenses
         WHERE voided_at IS NULL AND paid_at BETWEEN @from AND @to GROUP BY paid_at
       UNION ALL
       SELECT worked_on, 'staff', SUM(cost_cents) FROM work_shifts
         WHERE voided_at IS NULL AND worked_on BETWEEN @from AND @to GROUP BY worked_on`,
    )
    .all(range);
}

export function expensesByCategory(db: Db, range: DateRange): { category: ExpenseCategory; cents: number }[] {
  return db
    .prepare<[DateRange], { category: ExpenseCategory; cents: number }>(
      `SELECT category, SUM(amount_cents) AS cents FROM expenses
       WHERE voided_at IS NULL AND paid_at BETWEEN @from AND @to GROUP BY category ORDER BY cents DESC`,
    )
    .all(range);
}

export function planRanking(db: Db, range: DateRange): PlanRanking[] {
  return db
    .prepare<[DateRange], Omit<PlanRanking, 'withTeacher'> & { withTeacher: number }>(
      `SELECT s.plan_id AS planId, p.name AS planName, p.teacher_passes > 0 AS withTeacher,
         COUNT(*) AS count, SUM(s.local_price_cents) AS localCents
       FROM sales s JOIN plans p ON p.id = s.plan_id
       WHERE s.voided_at IS NULL AND s.sold_at BETWEEN @from AND @to
       GROUP BY s.plan_id ORDER BY count DESC, localCents DESC, planName`,
    )
    .all(range)
    .map((row) => ({ ...row, withTeacher: row.withTeacher === 1 }));
}

type ProductSalesRow = Omit<ProductRanking, 'profitCents'>;

/** Every product with what it sold in the range (zero when nothing), most units first. */
export function productSales(db: Db, range: DateRange): ProductSalesRow[] {
  return db
    .prepare<[DateRange], Omit<ProductSalesRow, 'active'> & { active: number }>(
      `SELECT p.id AS productId, p.name, p.active, COALESCE(u.units, 0) AS units,
         COALESCE(u.revenue, 0) AS revenueCents, COALESCE(u.cost, 0) AS costCents
       FROM products p
       LEFT JOIN (
         SELECT i.product_id, SUM(i.quantity) AS units, SUM(i.quantity * i.unit_price_cents) AS revenue,
           SUM(i.quantity * i.unit_cost_cents) AS cost
         FROM kiosk_sale_items i JOIN kiosk_sales k ON k.id = i.sale_id
         WHERE k.voided_at IS NULL AND k.sold_at BETWEEN @from AND @to GROUP BY i.product_id
       ) u ON u.product_id = p.id
       ORDER BY units DESC, revenueCents DESC, p.name COLLATE NOCASE`,
    )
    .all(range)
    .map((row) => ({ ...row, active: row.active === 1 }));
}

export function ticketCount(db: Db, range: DateRange): number {
  const row = db
    .prepare<[DateRange], { count: number }>('SELECT COUNT(*) AS count FROM kiosk_sales WHERE voided_at IS NULL AND sold_at BETWEEN @from AND @to')
    .get(range) as { count: number };
  return row.count;
}

export function walkInCounts(db: Db, range: DateRange): { kind: CounterSaleKind; count: number; cents: number }[] {
  return db
    .prepare<[DateRange], { kind: CounterSaleKind; count: number; cents: number }>(
      `SELECT kind, COUNT(*) AS count, SUM(price_cents) AS cents FROM counter_sales
       WHERE voided_at IS NULL AND sold_at BETWEEN @from AND @to GROUP BY kind`,
    )
    .all(range);
}

export interface VisitRow {
  date: string;
  weekday: number;
  hour: number;
  kind: VisitKind;
  visits: number;
}

/** Pass consumptions and walk-in day passes of the range, counted per local day, weekday, hour and kind. */
export function visits(db: Db, range: DateRange): VisitRow[] {
  return db
    .prepare<[DateRange], VisitRow>(
      `SELECT date(at, 'localtime') AS date, CAST(strftime('%w', at, 'localtime') AS INTEGER) AS weekday,
         CAST(strftime('%H', at, 'localtime') AS INTEGER) AS hour, kind, COUNT(*) AS visits
       FROM (
         SELECT consumed_at AS at, kind FROM consumptions WHERE voided_at IS NULL
         UNION ALL
         SELECT recorded_at, 'day_pass' FROM counter_sales WHERE voided_at IS NULL AND kind = 'day_pass'
       )
       WHERE date(at, 'localtime') BETWEEN @from AND @to
       GROUP BY 1, 2, 3, 4`,
    )
    .all(range);
}

type TeacherActivityRow = Omit<TeacherActivity, 'balanceCents' | 'active'> & { active: number };

export function teacherActivity(db: Db, range: DateRange): TeacherActivityRow[] {
  return db
    .prepare<[DateRange], TeacherActivityRow>(
      `WITH classes AS (
         SELECT s.teacher_id, s.client_id FROM consumptions c JOIN sales s ON s.id = c.sale_id
         WHERE c.voided_at IS NULL AND c.kind = 'teacher' AND date(c.consumed_at, 'localtime') BETWEEN @from AND @to
       )
       SELECT t.id AS teacherId, t.first_name || ' ' || t.last_name AS name, t.active,
         (SELECT COUNT(*) FROM classes WHERE teacher_id = t.id) AS classes,
         (SELECT COUNT(DISTINCT client_id) FROM classes WHERE teacher_id = t.id) AS students,
         (SELECT COALESCE(SUM(p.teacher_cents), 0) FROM payments p JOIN sales s ON s.id = p.sale_id
            WHERE s.teacher_id = t.id AND p.voided_at IS NULL AND p.paid_at BETWEEN @from AND @to) AS earnedCents,
         (SELECT COALESCE(SUM(amount_cents), 0) FROM teacher_payouts
            WHERE teacher_id = t.id AND voided_at IS NULL AND paid_at BETWEEN @from AND @to) AS paidOutCents
       FROM teachers t ORDER BY classes DESC, name`,
    )
    .all(range);
}
