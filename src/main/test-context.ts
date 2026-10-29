import type { ClientInput, PlanInput, TeacherInput } from '../shared/schemas';
import type { Clock, Context } from './context';
import { openDatabase } from './db/connection';

export const TEST_NOW = new Date(2026, 9, 5, 12, 0, 0);
/** For sales whose expiry doesn't matter to the test: far enough that it never expires nor warns. */
export const FAR_EXPIRY = '2099-12-31';

export interface MutableClock extends Clock {
  set(date: Date): void;
}

export interface TestContext extends Context {
  readonly clock: MutableClock;
}

export function createTestContext(now: Date = TEST_NOW): TestContext {
  let current = now;
  const ctx: TestContext = {
    db: openDatabase(':memory:'),
    clock: {
      now: () => current,
      set: (date) => {
        current = date;
      },
    },
  };
  // The migration sets the real install day; tests count kiosk stock by delivery unless they move it.
  setKioskPurchasesFrom(ctx, '2000-01-01');
  return ctx;
}

/** From this day the kiosk stock counts when the supplier is paid; before it, ticket by ticket. */
export function setKioskPurchasesFrom(ctx: TestContext, date: string): void {
  ctx.db.prepare("UPDATE settings SET value = ? WHERE key = 'kiosk_purchases_from'").run(date);
}

export const adultClient: ClientInput = {
  firstName: 'Ana',
  lastName: 'Roca',
  birthDate: '1990-05-10',
  dni: null,
  notes: null,
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
  active: true,
  schedules: [],
};

export const freePlan: PlanInput = { name: 'Pack 8 libres', freePasses: 8, teacherPasses: 0, priceCents: 2_000_000, teacherAmountCents: 0, active: true };
export const mixedPlan: PlanInput = {
  name: 'Pack 4+4',
  freePasses: 4,
  teacherPasses: 4,
  priceCents: 2_000_000,
  teacherAmountCents: 1_000_000,
  active: true,
};
