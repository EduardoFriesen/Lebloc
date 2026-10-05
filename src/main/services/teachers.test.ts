import { beforeEach, describe, expect, it } from 'vitest';
import { expectDomainError } from '../../test/helpers';
import { basicTeacher, createTestContext, type TestContext } from '../test-context';
import { createTeacher, getTeacher, listTeachers, updateTeacher } from './teachers';

describe('teachers service', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  it('creates a teacher with socials and schedules', () => {
    const teacher = createTeacher(ctx, {
      ...basicTeacher,
      socials: [{ network: 'Instagram', handle: '@juanpared' }],
      schedules: [
        { weekday: 3, startTime: '18:00', endTime: '20:00' },
        { weekday: 1, startTime: '19:00', endTime: '21:00' },
      ],
    });
    expect(teacher.active).toBe(true);
    expect(teacher.socials).toEqual([{ network: 'Instagram', handle: '@juanpared' }]);
    expect(teacher.schedules.map((s) => s.weekday)).toEqual([1, 3]);
    expect(getTeacher(ctx, teacher.id)).toEqual(teacher);
  });

  it('updates fields and replaces schedules', () => {
    const teacher = createTeacher(ctx, { ...basicTeacher, schedules: [{ weekday: 1, startTime: '19:00', endTime: '21:00' }] });
    const updated = updateTeacher(ctx, {
      ...basicTeacher,
      id: teacher.id,
      classRateCents: 300_000,
      schedules: [{ weekday: 5, startTime: '10:00', endTime: '12:00' }],
    });
    expect(updated.classRateCents).toBe(300_000);
    expect(updated.schedules).toEqual([{ weekday: 5, startTime: '10:00', endTime: '12:00' }]);
  });

  it('lists only active teachers unless asked otherwise', () => {
    createTeacher(ctx, basicTeacher);
    createTeacher(ctx, { ...basicTeacher, firstName: 'Eva', lastName: 'Bloque', active: false });
    expect(listTeachers(ctx, false).map((t) => t.firstName)).toEqual(['Juan']);
    expect(listTeachers(ctx, true)).toHaveLength(2);
  });

  it('fails with NOT_FOUND for unknown teachers', () => {
    expectDomainError(() => getTeacher(ctx, 999), 'NOT_FOUND');
    expectDomainError(() => updateTeacher(ctx, { ...basicTeacher, id: 999 }), 'NOT_FOUND');
  });
});
