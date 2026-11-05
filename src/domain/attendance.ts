import { toIsoDate } from './dates';

/** Local midnight today: the counter's entries of the day start here. */
export function todayStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** First day of the local month as an ISO date: sales from then on count as this month's enrollments. */
export function monthStart(now: Date): string {
  return toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
}
