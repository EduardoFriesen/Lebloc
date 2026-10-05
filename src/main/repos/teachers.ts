import { z } from 'zod';
import type { ScheduleInput, TeacherInput } from '../../shared/schemas';
import type { Teacher, TeacherSchedule } from '../../shared/types';
import type { Db } from '../db/connection';

export type TeacherFields = Omit<TeacherInput, 'schedules'>;

interface TeacherRow {
  id: number;
  firstName: string;
  lastName: string;
  address: string | null;
  phone: string | null;
  socials: string;
  classRateCents: number;
  active: number;
}

interface ScheduleRow extends TeacherSchedule {
  teacherId: number;
}

const storedSocials = z.array(z.object({ network: z.string(), handle: z.string() }));

const TEACHER_COLUMNS = `id, first_name AS firstName, last_name AS lastName, address, phone, socials,
  class_rate_cents AS classRateCents, active`;
const SCHEDULE_COLUMNS = 'teacher_id AS teacherId, weekday, start_time AS startTime, end_time AS endTime';

function teacherParams(fields: TeacherFields) {
  return {
    firstName: fields.firstName,
    lastName: fields.lastName,
    address: fields.address,
    phone: fields.phone,
    socials: JSON.stringify(fields.socials),
    classRateCents: fields.classRateCents,
    active: fields.active ? 1 : 0,
  };
}

function toTeacher(row: TeacherRow, schedules: readonly ScheduleRow[]): Teacher {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    address: row.address,
    phone: row.phone,
    socials: storedSocials.parse(JSON.parse(row.socials)),
    classRateCents: row.classRateCents,
    active: row.active === 1,
    schedules: schedules
      .filter((schedule) => schedule.teacherId === row.id)
      .map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime })),
  };
}

export function insertTeacher(db: Db, fields: TeacherFields): number {
  const result = db
    .prepare(
      `INSERT INTO teachers (first_name, last_name, address, phone, socials, class_rate_cents, active)
       VALUES (@firstName, @lastName, @address, @phone, @socials, @classRateCents, @active)`,
    )
    .run(teacherParams(fields));
  return Number(result.lastInsertRowid);
}

export function updateTeacher(db: Db, id: number, fields: TeacherFields): void {
  db.prepare(
    `UPDATE teachers SET first_name = @firstName, last_name = @lastName, address = @address, phone = @phone,
       socials = @socials, class_rate_cents = @classRateCents, active = @active
     WHERE id = @id`,
  ).run({ ...teacherParams(fields), id });
}

export function replaceSchedules(db: Db, teacherId: number, schedules: readonly ScheduleInput[]): void {
  db.prepare('DELETE FROM teacher_schedules WHERE teacher_id = ?').run(teacherId);
  const insert = db.prepare(
    `INSERT INTO teacher_schedules (teacher_id, weekday, start_time, end_time)
     VALUES (@teacherId, @weekday, @startTime, @endTime)`,
  );
  for (const schedule of schedules) {
    insert.run({ teacherId, weekday: schedule.weekday, startTime: schedule.startTime, endTime: schedule.endTime });
  }
}

export function findTeacher(db: Db, id: number): Teacher | undefined {
  const row = db.prepare<[number], TeacherRow>(`SELECT ${TEACHER_COLUMNS} FROM teachers WHERE id = ?`).get(id);
  if (!row) return undefined;
  const schedules = db
    .prepare<[number], ScheduleRow>(
      `SELECT ${SCHEDULE_COLUMNS} FROM teacher_schedules WHERE teacher_id = ? ORDER BY weekday, start_time`,
    )
    .all(id);
  return toTeacher(row, schedules);
}

export function listTeachers(db: Db, includeInactive: boolean): Teacher[] {
  const rows = db
    .prepare<[number], TeacherRow>(
      `SELECT ${TEACHER_COLUMNS} FROM teachers WHERE (? = 1 OR active = 1)
       ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE`,
    )
    .all(includeInactive ? 1 : 0);
  const schedules = db
    .prepare<[], ScheduleRow>(`SELECT ${SCHEDULE_COLUMNS} FROM teacher_schedules ORDER BY weekday, start_time`)
    .all();
  return rows.map((row) => toTeacher(row, schedules));
}
