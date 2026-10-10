import { describe, expect, it } from 'vitest';
import { attendanceWindows, monthStart } from './attendance';

describe('attendanceWindows', () => {
  const now = new Date(2026, 9, 8, 18, 20, 0); // jueves 8/10 18:20 hora local

  it('looks at the same weekday last week, one hour before and after the current time', () => {
    const { usualSlot } = attendanceWindows(now);
    expect(usualSlot.from).toEqual(new Date(2026, 9, 1, 17, 20, 0));
    expect(usualSlot.to).toEqual(new Date(2026, 9, 1, 19, 20, 0));
  });

  it('starts "today" at local midnight and the renewal window 30 days back', () => {
    const { todayStart, renewalFrom } = attendanceWindows(now);
    expect(todayStart).toEqual(new Date(2026, 9, 8, 0, 0, 0));
    expect(renewalFrom).toEqual(new Date(2026, 8, 8, 18, 20, 0));
  });
});

describe('monthStart', () => {
  it('is the first day of the current local month as an ISO date', () => {
    expect(monthStart(new Date(2026, 9, 8, 18, 20))).toBe('2026-10-01');
    expect(monthStart(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });
});
