import { DomainError } from '../../domain/errors';
import type { ExpenseInput } from '../../shared/schemas';
import type { Expense, ExpenseCategory, ExpenseMonth } from '../../shared/types';
import { type Context, nowIso, today } from '../context';
import * as repo from '../repos/expenses';

function getExpense(ctx: Context, id: number): Expense {
  const expense = repo.findExpense(ctx.db, id);
  if (!expense) throw new DomainError('NOT_FOUND');
  return expense;
}

export function createExpense(ctx: Context, input: ExpenseInput): Expense {
  if (input.paidAt > today(ctx)) throw new DomainError('DATE_IN_FUTURE');
  return getExpense(ctx, repo.insertExpense(ctx.db, { ...input, recordedAt: nowIso(ctx) }));
}

export function voidExpense(ctx: Context, id: number): Expense {
  if (getExpense(ctx, id).voidedAt) throw new DomainError('ALREADY_VOIDED');
  repo.voidExpenseRow(ctx.db, id, nowIso(ctx));
  return getExpense(ctx, id);
}

export function getExpenseMonth(ctx: Context, month: string): ExpenseMonth {
  const expenses = repo.listExpensesInMonth(ctx.db, month);
  const byCategory = new Map<ExpenseCategory, number>();
  for (const expense of expenses) {
    if (!expense.voidedAt) byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amountCents);
  }
  return {
    expenses,
    totalCents: [...byCategory.values()].reduce((total, cents) => total + cents, 0),
    byCategory: [...byCategory].map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents),
  };
}
