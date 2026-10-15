import { toIsoDate } from './dates';

export interface AttendanceWindows {
  /** Local midnight today: the counter's entries of the day start here. */
  todayStart: Date;
  /** Who came in the last 30 days counts for the renewal list. */
  renewalFrom: Date;
}

const RENEWAL_DAYS = 30;

// Calendar arithmetic on local fields (not milliseconds) so a DST change doesn't shift the hour.
function shift(now: Date, days: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, now.getHours(), now.getMinutes(), now.getSeconds());
}

export function attendanceWindows(now: Date): AttendanceWindows {
  return {
    todayStart: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    renewalFrom: shift(now, -RENEWAL_DAYS),
  };
}

/** First day of the local month as an ISO date: sales from then on count as this month's enrollments. */
export function monthStart(now: Date): string {
  return toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
}
