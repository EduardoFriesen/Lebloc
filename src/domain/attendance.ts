export interface TimeRange {
  from: Date;
  to: Date;
}

export interface AttendanceWindows {
  /** Same weekday last week, one hour before and after now: who usually comes at this time. */
  usualSlot: TimeRange;
  /** Local midnight today: who already came today drops out of the preload. */
  todayStart: Date;
  /** Who came in the last 30 days counts for the renewal list. */
  renewalFrom: Date;
}

const USUAL_SLOT_HOURS = 1;
const RENEWAL_DAYS = 30;

// Calendar arithmetic on local fields (not milliseconds) so a DST change doesn't shift the hour.
function shift(now: Date, days: number, hours = 0): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, now.getHours() + hours, now.getMinutes(), now.getSeconds());
}

export function attendanceWindows(now: Date): AttendanceWindows {
  return {
    usualSlot: { from: shift(now, -7, -USUAL_SLOT_HOURS), to: shift(now, -7, USUAL_SLOT_HOURS) },
    todayStart: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    renewalFrom: shift(now, -RENEWAL_DAYS),
  };
}
