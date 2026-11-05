import { DomainError } from '../../domain/errors';
import type { ExpenseInput, ExpensePaidInput } from '../../shared/schemas';
import type { Expense, ExpenseCategory, ExpenseMonth } from '../../shared/types';
import { assertNotFuture, type Context, nowIso } from '../context';
import * as repo from '../repos/expenses';

/** Products named in a supplier payment's row in Gastos. */
const SHOWN_PRODUCTS = 3;

function getExpense(ctx: Context, id: number): Expense {
  const expense = repo.findExpense(ctx.db, id);
  if (!expense) throw new DomainError('NOT_FOUND');
  return expense;
}

export function createExpense(ctx: Context, input: ExpenseInput): Expense {
  assertNotFuture(ctx, input.paidAt);
  return getExpense(ctx, repo.insertExpense(ctx.db, { ...input, recordedAt: nowIso(ctx) }));
}

export function voidExpense(ctx: Context, id: number): Expense {
  if (getExpense(ctx, id).voidedAt) throw new DomainError('ALREADY_VOIDED');
  repo.voidExpenseRow(ctx.db, id, nowIso(ctx));
  return getExpense(ctx, id);
}

/** Ticks (or unticks) that the expense was actually paid; only a mark, the balance doesn't change. */
export function setExpensePaid(ctx: Context, input: ExpensePaidInput): Expense {
  if (getExpense(ctx, input.id).voidedAt) throw new DomainError('ALREADY_VOIDED');
  repo.setMarkedPaidAt(ctx.db, input.id, input.paid ? nowIso(ctx) : null);
  return getExpense(ctx, input.id);
}

export function getExpenseMonth(ctx: Context, month: string): ExpenseMonth {
  const expenses = repo.listExpensesInMonth(ctx.db, month);
  const byCategory = new Map<ExpenseCategory, number>();
  for (const expense of expenses) {
    if (!expense.voidedAt) byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amountCents);
  }
  // Up to three products by name; the delivery's detail, a click away, has them all.
  const supplierPayments = repo.listSupplierPaymentsInMonth(ctx.db, month, SHOWN_PRODUCTS).map(({ firstProducts, productCount, ...payment }) => ({
    ...payment,
    productsLabel: productCount > SHOWN_PRODUCTS ? `${firstProducts} y ${productCount - SHOWN_PRODUCTS} más` : firstProducts,
  }));
  const supplierCents = supplierPayments.reduce((total, payment) => total + payment.amountCents, 0);
  return {
    expenses,
    supplierPayments,
    supplierCents,
    // The kiosk stock paid this month is money that went out too.
    totalCents: [...byCategory.values()].reduce((total, cents) => total + cents, supplierCents),
    byCategory: [...byCategory].map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents),
  };
}
