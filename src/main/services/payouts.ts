import { DomainError } from '../../domain/errors';
import { assertPayoutFits, teacherBalance } from '../../domain/ledger';
import type { PayoutInput } from '../../shared/schemas';
import type { TeacherAccount, TeacherBalance, TeacherPayout } from '../../shared/types';
import { type Context, nowIso } from '../context';
import * as repo from '../repos/payouts';
import { listEnrollments } from './enrollments';
import { getTeacher } from './teachers';

function toBalance(row: repo.BalanceRow): TeacherBalance {
  return { ...row, balanceCents: teacherBalance(row.earnedCents, row.paidOutCents) };
}

function getBalance(ctx: Context, teacherId: number): TeacherBalance {
  const row = repo.findBalanceRow(ctx.db, teacherId);
  if (!row) throw new DomainError('NOT_FOUND');
  return toBalance(row);
}

export function listTeacherBalances(ctx: Context): TeacherBalance[] {
  return repo.listBalanceRows(ctx.db).map(toBalance);
}

export function getTeacherAccount(ctx: Context, teacherId: number): TeacherAccount {
  const teacher = getTeacher(ctx, teacherId);
  return {
    ...getBalance(ctx, teacherId),
    teacher,
    payouts: repo.listPayoutsForTeacher(ctx.db, teacherId),
    shares: repo.listTeacherShares(ctx.db, teacherId),
    enrollments: listEnrollments(ctx, { teacherId }),
  };
}

export function getPayout(ctx: Context, id: number): TeacherPayout {
  const payout = repo.findPayout(ctx.db, id);
  if (!payout) throw new DomainError('NOT_FOUND');
  return payout;
}

export function registerPayout(ctx: Context, input: PayoutInput): TeacherPayout {
  return ctx.db.transaction(() => {
    assertPayoutFits(getBalance(ctx, input.teacherId).balanceCents, input.amountCents);
    const id = repo.insertPayout(ctx.db, {
      teacherId: input.teacherId,
      paidAt: input.paidAt,
      amountCents: input.amountCents,
      method: input.method,
      note: input.note,
    });
    return getPayout(ctx, id);
  })();
}

export function voidPayout(ctx: Context, id: number): TeacherPayout {
  const payout = getPayout(ctx, id);
  if (payout.voidedAt) throw new DomainError('ALREADY_VOIDED');
  repo.voidPayout(ctx.db, id, nowIso(ctx));
  return getPayout(ctx, id);
}
