import { addMonths, daysBetween, parseIsoDate } from './dates';

export type Granularity = 'day' | 'week' | 'month';

export interface DateRange {
  from: string;
  to: string;
}

export const PERIOD_PRESETS = ['this_month', 'last_month', 'last_3_months', 'last_12_months', 'this_year'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

const DAILY_UP_TO = 31;
const WEEKLY_UP_TO = 186;

export function addDays(iso: string, days: number): string {
  const [year, month, day] = parseIsoDate(iso);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const monthEnd = (iso: string) => addDays(addMonths(monthStart(iso), 1), -1);
const monthIndex = (iso: string) => {
  const [year, month] = parseIsoDate(iso);
  return year * 12 + month;
};

export function presetRange(preset: PeriodPreset, today: string): DateRange {
  const thisMonth = monthStart(today);
  switch (preset) {
    case 'this_month':
      return { from: thisMonth, to: today };
    case 'last_month': {
      const from = addMonths(thisMonth, -1);
      return { from, to: monthEnd(from) };
    }
    case 'last_3_months':
      return { from: addMonths(thisMonth, -2), to: today };
    case 'last_12_months':
      return { from: addMonths(thisMonth, -11), to: today };
    case 'this_year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

/**
 * What a range is compared with. From the 1st of a month: the same months right before, up to the same day
 * ("this month so far" meets "last month up to today's day"; a whole month meets the whole month before).
 * Otherwise the same number of days right before.
 */
export function previousRange(range: DateRange): DateRange {
  if (range.from.endsWith('-01')) {
    const months = monthIndex(range.to) - monthIndex(range.from) + 1;
    const to = addMonths(range.to, -months);
    return { from: addMonths(range.from, -months), to: range.to === monthEnd(range.to) ? monthEnd(to) : to };
  }
  const days = daysBetween(range.from, range.to) + 1;
  return { from: addDays(range.from, -days), to: addDays(range.from, -1) };
}

export function granularityFor(range: DateRange): Granularity {
  const days = daysBetween(range.from, range.to) + 1;
  if (days <= DAILY_UP_TO) return 'day';
  return days <= WEEKLY_UP_TO ? 'week' : 'month';
}

/** The day itself, the Monday of its week, or its 'YYYY-MM' month. */
export function bucketKey(date: string, granularity: Granularity): string {
  if (granularity === 'day') return date;
  if (granularity === 'month') return date.slice(0, 7);
  const [year, month, day] = parseIsoDate(date);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

export function bucketKeys(range: DateRange, granularity: Granularity): string[] {
  const keys: string[] = [];
  const last = bucketKey(range.to, granularity);
  let cursor = granularity === 'month' ? monthStart(range.from) : bucketKey(range.from, granularity);
  for (let key = bucketKey(cursor, granularity); key <= last; key = bucketKey(cursor, granularity)) {
    keys.push(key);
    cursor = granularity === 'month' ? addMonths(cursor, 1) : addDays(cursor, granularity === 'week' ? 7 : 1);
  }
  return keys;
}

/** Adds daily rows into every bucket of the range, so empty buckets show as zero instead of a gap. */
export function bucketize<F extends string>(
  range: DateRange,
  granularity: Granularity,
  rows: readonly ({ date: string } & Record<F, number>)[],
  fields: readonly F[],
): ({ bucket: string } & Record<F, number>)[] {
  const zero = () => Object.fromEntries(fields.map((field) => [field, 0])) as Record<F, number>;
  const sums = new Map(bucketKeys(range, granularity).map((key) => [key, zero()]));
  for (const row of rows) {
    const sum = sums.get(bucketKey(row.date, granularity));
    if (sum) for (const field of fields) sum[field] += row[field];
  }
  return [...sums].map(([bucket, sum]) => ({ bucket, ...sum }));
}

/** Rounded change in percent; null when the previous value is 0 (no base to compare with). */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}
