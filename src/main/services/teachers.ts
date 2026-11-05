import { DomainError } from '../../domain/errors';
import type { TeacherInput, TeacherUpdate } from '../../shared/schemas';
import type { Teacher } from '../../shared/types';
import type { Context } from '../context';
import * as repo from '../repos/teachers';

export function getTeacher(ctx: Context, id: number): Teacher {
  const teacher = repo.findTeacher(ctx.db, id);
  if (!teacher) throw new DomainError('NOT_FOUND');
  return teacher;
}

export function listTeachers(ctx: Context, includeInactive: boolean): Teacher[] {
  return repo.listTeachers(ctx.db, includeInactive);
}

export function createTeacher(ctx: Context, input: TeacherInput): Teacher {
  return ctx.db.transaction(() => {
    const id = repo.insertTeacher(ctx.db, input);
    repo.replaceSchedules(ctx.db, id, input.schedules);
    return getTeacher(ctx, id);
  })();
}

export function updateTeacher(ctx: Context, input: TeacherUpdate): Teacher {
  getTeacher(ctx, input.id);
  return ctx.db.transaction(() => {
    repo.updateTeacher(ctx.db, input.id, input);
    repo.replaceSchedules(ctx.db, input.id, input.schedules);
    return getTeacher(ctx, input.id);
  })();
}
