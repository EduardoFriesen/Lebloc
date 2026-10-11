import { beforeEach, describe, expect, it } from 'vitest';
import type { SaleInput } from '../../shared/schemas';
import { adultClient, basicTeacher, createTestContext, freePlan, minorClient, mixedPlan, type TestContext } from '../test-context';
import { archiveClient, createClient } from './clients';
import { consume } from './consumptions';
import { getTeacherAccount } from './payouts';
import { createPlan } from './plans';
import { sellPlan, voidSale } from './sales';
import { getClientStats, getPlanStats, getTeacherStats } from './stats';
import { createTeacher } from './teachers';
import { signWaiver } from './waivers';

describe('summary stats', () => {
  let ctx: TestContext;
  let freePlanId: number;

  beforeEach(() => {
    ctx = createTestContext();
    freePlanId = createPlan(ctx, freePlan).id;
  });

  function saleOf(overrides: Partial<SaleInput> & Pick<SaleInput, 'clientId'>): SaleInput {
    return { planId: freePlanId, teacherId: null, splitRule: 'proportional', soldAt: '2026-10-05', initialPayment: null, ...overrides };
  }

  it('counts active and archived clients, passes, debt, pending waivers, minors and this month enrollments', () => {
    const anaId = createClient(ctx, adultClient).id;
    sellPlan(ctx, saleOf({ clientId: anaId }));

    const tomiId = createClient(ctx, { ...minorClient, enrolledAt: '2026-09-15' }).id;
    signWaiver(ctx, { clientId: tomiId, signedAt: '2026-10-01' });

    const carlaId = createClient(ctx, { ...adultClient, firstName: 'Carla' }).id;
    sellPlan(ctx, saleOf({ clientId: carlaId }));
    archiveClient(ctx, carlaId);

    expect(getClientStats(ctx)).toEqual({
      active: 2,
      archived: 1,
      withPasses: 1,
      withoutPasses: 1,
      debtorCount: 1,
      debtTotalCents: 2_000_000,
      pendingWaivers: 1,
      minors: 1,
      newThisMonth: 1,
    });
  });

  it('counts active and inactive teachers, what the local owes them and the classes left to give', () => {
    const juanId = createTeacher(ctx, basicTeacher).id;
    createTeacher(ctx, { ...basicTeacher, firstName: 'Eva' });
    createTeacher(ctx, { ...basicTeacher, firstName: 'Leo', active: false });
    const mixedId = createPlan(ctx, mixedPlan).id;

    const anaId = createClient(ctx, adultClient).id;
    const paid = { amountCents: 3_000_000, method: 'cash' as const, paidAt: '2026-10-05' };
    sellPlan(ctx, saleOf({ clientId: anaId, planId: mixedId, teacherId: juanId, initialPayment: paid }));
    consume(ctx, { clientId: anaId, kind: 'teacher', note: null });

    const carlaId = createClient(ctx, { ...adultClient, firstName: 'Carla' }).id;
    sellPlan(ctx, saleOf({ clientId: carlaId, planId: mixedId, teacherId: juanId }));
    archiveClient(ctx, carlaId);

    const owedToJuan = getTeacherAccount(ctx, juanId).balanceCents;
    expect(owedToJuan).toBeGreaterThan(0);
    expect(getTeacherStats(ctx)).toEqual({ active: 2, inactive: 1, owedCents: owedToJuan, owedTeachers: 1, pendingClasses: 3 });
  });

  it("counts active and inactive plans and this month's sales at the local's price, leaving out the teacher surcharge", () => {
    const mixedId = createPlan(ctx, mixedPlan).id;
    createPlan(ctx, { ...freePlan, name: 'Viejo', active: false });
    const juanId = createTeacher(ctx, basicTeacher).id;
    const anaId = createClient(ctx, adultClient).id;

    sellPlan(ctx, saleOf({ clientId: anaId }));
    const withTeacher = sellPlan(ctx, saleOf({ clientId: anaId, planId: mixedId, teacherId: juanId, soldAt: '2026-10-02' }));
    expect(withTeacher.teacherSurchargeCents).toBeGreaterThan(0);
    sellPlan(ctx, saleOf({ clientId: anaId, soldAt: '2026-09-20' }));
    voidSale(ctx, sellPlan(ctx, saleOf({ clientId: anaId, soldAt: '2026-10-03' })).id);

    expect(getPlanStats(ctx)).toEqual({ active: 2, inactive: 1, monthSales: 2, monthLocalCents: 4_000_000 });
  });
});
