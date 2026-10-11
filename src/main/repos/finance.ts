import type { MoneySource } from '../../domain/finance';
import type { DateRange } from '../../domain/periods';
import type { ExpenseCategory } from '../../shared/types';
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
