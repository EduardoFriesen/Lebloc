import type { ExpenseInput } from '../../shared/schemas';
import type { Expense } from '../../shared/types';
import type { Db } from '../db/connection';

const COLUMNS = `id, category, description, amount_cents AS amountCents, method, paid_at AS paidAt,
  recorded_at AS recordedAt, marked_paid_at AS markedPaidAt, voided_at AS voidedAt`;

/** First and last possible ISO dates of a 'YYYY-MM' month; '-31' also covers shorter months as text. */
export function monthBounds(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${month}-31` };
}

export function insertExpense(db: Db, expense: ExpenseInput & { recordedAt: string }): number {
  const result = db
    .prepare(
      `INSERT INTO expenses (category, description, amount_cents, method, paid_at, recorded_at)
       VALUES (@category, @description, @amountCents, @method, @paidAt, @recordedAt)`,
    )
    .run(expense);
  return Number(result.lastInsertRowid);
}

export function findExpense(db: Db, id: number): Expense | undefined {
  return db.prepare<[number], Expense>(`SELECT ${COLUMNS} FROM expenses WHERE id = ?`).get(id);
}

export function listExpensesInMonth(db: Db, month: string): Expense[] {
  return db
    .prepare<[{ from: string; to: string }], Expense>(
      `SELECT ${COLUMNS} FROM expenses WHERE paid_at BETWEEN @from AND @to ORDER BY paid_at DESC, id DESC`,
    )
    .all(monthBounds(month));
}

export function setMarkedPaidAt(db: Db, id: number, markedPaidAt: string | null): void {
  db.prepare('UPDATE expenses SET marked_paid_at = ? WHERE id = ?').run(markedPaidAt, id);
}

export function voidExpenseRow(db: Db, id: number, now: string): void {
  db.prepare('UPDATE expenses SET voided_at = ? WHERE id = ?').run(now, id);
}
