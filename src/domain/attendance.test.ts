import { describe, expect, it } from 'vitest';
import { attendanceWindows } from './attendance';

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
