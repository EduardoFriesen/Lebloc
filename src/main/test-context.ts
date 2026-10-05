import type { ClientInput, PlanInput, TeacherInput } from '../shared/schemas';
import type { Clock, Context } from './context';
import { openDatabase } from './db/connection';

export const TEST_NOW = new Date(2026, 9, 5, 12, 0, 0);

export interface MutableClock extends Clock {
  set(date: Date): void;
}

export interface TestContext extends Context {
  readonly clock: MutableClock;
}

export function createTestContext(now: Date = TEST_NOW): TestContext {
  let current = now;
  return {
    db: openDatabase(':memory:'),
    clock: {
      now: () => current,
      set: (date) => {
        current = date;
      },
    },
  };
}

export const adultClient: ClientInput = {
  firstName: 'Ana',
  lastName: 'Roca',
  birthDate: '1990-05-10',
  address: null,
  phone: '1155550000',
  emergencyName: 'Luis Roca',
  emergencyPhone: '1155550001',
  emergencyRelation: 'Hermano',
  enrolledAt: '2026-10-01',
  guardians: [],
};

export const minorClient: ClientInput = {
  ...adultClient,
  firstName: 'Tomi',
  birthDate: '2014-03-02',
  guardians: [{ firstName: 'Laura', lastName: 'Roca', dni: '30111222', phone: '1155550002', relation: 'Madre' }],
};

export const basicTeacher: TeacherInput = {
  firstName: 'Juan',
  lastName: 'Pared',
  address: null,
  phone: null,
  socials: [],
  classRateCents: 250_000,
  active: true,
  schedules: [],
};

export const freePlan: PlanInput = { name: 'Pack 8 libres', freePasses: 8, teacherPasses: 0, priceCents: 2_000_000, active: true };
export const mixedPlan: PlanInput = { name: 'Pack 4+4', freePasses: 4, teacherPasses: 4, priceCents: 2_000_000, active: true };
