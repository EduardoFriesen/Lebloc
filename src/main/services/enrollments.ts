import { monthStart } from '../../domain/attendance';
import { passStatus } from '../../domain/passes';
import type { Enrollment } from '../../shared/types';
import type { Context } from '../context';
import { listMonthEnrollments } from '../repos/saleStats';
import { getSettings } from './settings';

/** This calendar month's sales of a plan or with a teacher, tinted by the passes left on each sale. */
export function listEnrollments(ctx: Context, filter: { planId?: number; teacherId?: number }): Enrollment[] {
  const { lowPassesThreshold } = getSettings(ctx);
  return listMonthEnrollments(ctx.db, { ...filter, from: monthStart(ctx.clock.now()) }).map((row) => ({
    ...row,
    passStatus: passStatus(row.remainingFree + row.remainingTeacher, lowPassesThreshold),
  }));
}
