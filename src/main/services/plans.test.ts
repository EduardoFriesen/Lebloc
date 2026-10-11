import { beforeEach, describe, expect, it } from 'vitest';
import { expectDomainError } from '../../test/helpers';
import { adultClient, basicTeacher, createTestContext, freePlan, mixedPlan, type TestContext } from '../test-context';
import { archiveClient, createClient } from './clients';
import { consume } from './consumptions';
import { registerPayment } from './payments';
import { createPlan, getPlan, getPlanEnrollments, listPlanSales, listPlans, updatePlan } from './plans';
import { sellPlan, voidSale } from './sales';
import { createTeacher } from './teachers';

describe('plans service', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  it('creates and reads a plan', () => {
    const plan = createPlan(ctx, mixedPlan);
    expect(plan).toEqual({ id: plan.id, ...mixedPlan });
    expect(getPlan(ctx, plan.id)).toEqual(plan);
  });

  it('updates a plan', () => {
    const plan = createPlan(ctx, freePlan);
    expect(updatePlan(ctx, { ...freePlan, id: plan.id, priceCents: 2_500_000, active: false })).toMatchObject({
      priceCents: 2_500_000,
      active: false,
    });
  });

  it('lists only active plans unless asked otherwise', () => {
    createPlan(ctx, freePlan);
    createPlan(ctx, { ...mixedPlan, active: false });
    expect(listPlans(ctx, false).map((p) => p.name)).toEqual(['Pack 8 libres']);
    expect(listPlans(ctx, true)).toHaveLength(2);
  });

  it('fails with NOT_FOUND for unknown plans', () => {
    expectDomainError(() => getPlan(ctx, 999), 'NOT_FOUND');
    expectDomainError(() => updatePlan(ctx, { ...freePlan, id: 999 }), 'NOT_FOUND');
  });

  describe('month enrollments', () => {
    // TEST_NOW is 5/10/2026: "this month" starts on 1/10.
    it("lists this month's sales of the plan with that sale's passes and debt", () => {
      const plan = createPlan(ctx, freePlan);
      const other = createPlan(ctx, { ...freePlan, name: 'Otro pack' });
      const ana = createClient(ctx, adultClient).id;
      const bruno = createClient(ctx, { ...adultClient, firstName: 'Bruno', lastName: 'Sierra' }).id;
      const carla = createClient(ctx, { ...adultClient, firstName: 'Carla', lastName: 'Vía' }).id;
      const sell = (clientId: number, planId: number, soldAt: string) =>
        sellPlan(ctx, { clientId, planId, teacherId: null, splitRule: 'proportional', soldAt, initialPayment: null });

      const anaSale = sell(ana, plan.id, '2026-10-02');
      registerPayment(ctx, { saleId: anaSale.id, amountCents: 500_000, method: 'cash', paidAt: '2026-10-02' });
      consume(ctx, { clientId: ana, kind: 'free', note: null });
      sell(bruno, plan.id, '2026-09-30');
      voidSale(ctx, sell(bruno, plan.id, '2026-10-03').id);
      sell(carla, plan.id, '2026-10-04');
      archiveClient(ctx, carla);
      sell(bruno, other.id, '2026-10-04');

      expect(getPlanEnrollments(ctx, plan.id)).toEqual([
        {
          saleId: anaSale.id,
          clientId: ana,
          clientName: 'Ana Roca',
          planName: 'Pack 8 libres',
          teacherName: null,
          soldAt: '2026-10-02',
          remainingFree: 7,
          remainingTeacher: 0,
          debtCents: 1_500_000,
          passStatus: 'ok',
        },
      ]);
    });

    it('rejects an unknown plan', () => {
      expectDomainError(() => getPlanEnrollments(ctx, 999), 'NOT_FOUND');
    });
  });

  describe('plan sales', () => {
    function scenario() {
      const pack = createPlan(ctx, freePlan);
      const mixed = createPlan(ctx, mixedPlan);
      const teacherId = createTeacher(ctx, basicTeacher).id;
      const ana = createClient(ctx, adultClient).id;
      const bruno = createClient(ctx, { ...adultClient, firstName: 'Bruno', lastName: 'Sierra' }).id;
      const sell = (clientId: number, planId: number, soldAt: string, teacher: number | null = null) =>
        sellPlan(ctx, { clientId, planId, teacherId: teacher, splitRule: 'proportional', soldAt, initialPayment: null });

      const anaSale = sell(ana, pack.id, '2026-10-01');
      registerPayment(ctx, { saleId: anaSale.id, amountCents: 500_000, method: 'cash', paidAt: '2026-10-02' });
      const brunoSale = sell(bruno, mixed.id, '2026-10-04', teacherId);
      archiveClient(ctx, bruno);
      sell(ana, pack.id, '2026-09-30');
      voidSale(ctx, sell(ana, pack.id, '2026-10-03').id);
      // The sale keeps the name the plan had when it was sold.
      updatePlan(ctx, { ...freePlan, id: pack.id, name: 'Pack 8 renovado' });
      return { pack, ana, bruno, anaSale, brunoSale };
    }

    it("lists the month's valid sales, newest first, with the teacher and what is still owed", () => {
      const { ana, bruno, anaSale, brunoSale } = scenario();
      expect(listPlanSales(ctx, { month: '2026-10' })).toEqual([
        {
          saleId: brunoSale.id,
          soldAt: '2026-10-04',
          clientId: bruno,
          clientName: 'Bruno Sierra',
          planName: 'Pack 4+4',
          teacherName: 'Juan Pared',
          totalCents: 3_000_000,
          debtCents: 3_000_000,
        },
        {
          saleId: anaSale.id,
          soldAt: '2026-10-01',
          clientId: ana,
          clientName: 'Ana Roca',
          planName: 'Pack 8 libres',
          teacherName: null,
          totalCents: 2_000_000,
          debtCents: 1_500_000,
        },
      ]);
      expect(listPlanSales(ctx, { month: '2026-09' }).map((sale) => sale.soldAt)).toEqual(['2026-09-30']);
    });

    it('filters by plan and rejects an unknown plan', () => {
      const { pack, anaSale } = scenario();
      expect(listPlanSales(ctx, { month: '2026-10', planId: pack.id }).map((sale) => sale.saleId)).toEqual([anaSale.id]);
      expectDomainError(() => listPlanSales(ctx, { month: '2026-10', planId: 999 }), 'NOT_FOUND');
    });
  });
});
