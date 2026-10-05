import { beforeEach, describe, expect, it } from 'vitest';
import type { SaleInput } from '../../shared/schemas';
import { expectDomainError } from '../../test/helpers';
import { adultClient, basicTeacher, createTestContext, freePlan, mixedPlan, type TestContext } from '../test-context';
import { archiveClient, createClient } from './clients';
import { registerPayment, voidPayment } from './payments';
import { createPlan, updatePlan } from './plans';
import { getSale, sellPlan, voidSale } from './sales';
import { createTeacher, updateTeacher } from './teachers';

describe('sales and payments', () => {
  let ctx: TestContext;
  let clientId: number;
  let teacherId: number;
  let freePlanId: number;
  let mixedPlanId: number;

  beforeEach(() => {
    ctx = createTestContext();
    clientId = createClient(ctx, adultClient).id;
    teacherId = createTeacher(ctx, basicTeacher).id;
    freePlanId = createPlan(ctx, freePlan).id;
    mixedPlanId = createPlan(ctx, mixedPlan).id;
  });

  function saleOf(overrides: Partial<SaleInput>): SaleInput {
    return {
      clientId,
      planId: freePlanId,
      teacherId: null,
      splitRule: 'proportional',
      soldAt: '2026-10-05',
      initialPayment: null,
      ...overrides,
    };
  }

  function pay(saleId: number, amountCents: number) {
    return registerPayment(ctx, { saleId, amountCents, method: 'cash', paidAt: '2026-10-05' });
  }

  it('sells a free plan: the total is the plan price and all of it is owed', () => {
    expect(sellPlan(ctx, saleOf({}))).toMatchObject({
      planName: 'Pack 8 libres',
      totalCents: 2_000_000,
      teacherSurchargeCents: 0,
      teacherId: null,
      teacherName: null,
      paidCents: 0,
      debtCents: 2_000_000,
      remainingFree: 8,
      remainingTeacher: 0,
      voidedAt: null,
    });
  });

  it('sells a mixed plan adding the teacher surcharge', () => {
    expect(sellPlan(ctx, saleOf({ planId: mixedPlanId, teacherId }))).toMatchObject({
      teacherName: 'Juan Pared',
      teacherRateCents: 250_000,
      teacherSurchargeCents: 1_000_000,
      totalCents: 3_000_000,
      remainingFree: 4,
      remainingTeacher: 4,
    });
  });

  it('registers the initial payment with the split rule chosen at sale time', () => {
    const sale = sellPlan(
      ctx,
      saleOf({
        planId: mixedPlanId,
        teacherId,
        splitRule: 'teacher_first',
        initialPayment: { amountCents: 1_500_000, method: 'transfer', paidAt: '2026-10-05' },
      }),
    );
    expect(sale).toMatchObject({ paidCents: 1_500_000, debtCents: 1_500_000 });
    // The first payment already covered the whole surcharge, so the second one is all local.
    expect(pay(sale.id, 1_500_000)).toMatchObject({ localCents: 1_500_000, teacherCents: 0 });
  });

  it('splits proportionally by default', () => {
    const sale = sellPlan(ctx, saleOf({ planId: mixedPlanId, teacherId }));
    expect(pay(sale.id, 1_500_000)).toMatchObject({ amountCents: 1_500_000, localCents: 1_000_000, teacherCents: 500_000, voidedAt: null });
  });

  it('rejects invalid sales', () => {
    expectDomainError(() => sellPlan(ctx, saleOf({ planId: mixedPlanId })), 'TEACHER_REQUIRED');
    expectDomainError(() => sellPlan(ctx, saleOf({ teacherId })), 'TEACHER_NOT_ALLOWED');
    expectDomainError(() => sellPlan(ctx, saleOf({ planId: 999 })), 'NOT_FOUND');
    updateTeacher(ctx, { ...basicTeacher, id: teacherId, active: false });
    expectDomainError(() => sellPlan(ctx, saleOf({ planId: mixedPlanId, teacherId })), 'INACTIVE_TEACHER');
    updatePlan(ctx, { ...freePlan, id: freePlanId, active: false });
    expectDomainError(() => sellPlan(ctx, saleOf({})), 'INACTIVE_PLAN');
    archiveClient(ctx, clientId);
    expectDomainError(() => sellPlan(ctx, saleOf({ planId: mixedPlanId })), 'CLIENT_ARCHIVED');
  });

  it('rolls the sale back when the initial payment is invalid', () => {
    expectDomainError(
      () => sellPlan(ctx, saleOf({ initialPayment: { amountCents: 2_000_001, method: 'cash', paidAt: '2026-10-05' } })),
      'PAYMENT_EXCEEDS_DEBT',
    );
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM sales').get()).toEqual({ n: 0 });
  });

  it('keeps the sale snapshot when the plan or the teacher change later', () => {
    const sale = sellPlan(ctx, saleOf({ planId: mixedPlanId, teacherId }));
    updatePlan(ctx, { ...mixedPlan, id: mixedPlanId, priceCents: 9_000_000 });
    updateTeacher(ctx, { ...basicTeacher, id: teacherId, classRateCents: 900_000 });
    expect(getSale(ctx, sale.id)).toMatchObject({ localPriceCents: 2_000_000, teacherRateCents: 250_000, totalCents: 3_000_000 });
  });

  it('rejects payments above the debt and payments on voided sales', () => {
    const sale = sellPlan(ctx, saleOf({}));
    pay(sale.id, 1_500_000);
    expectDomainError(() => pay(sale.id, 500_001), 'PAYMENT_EXCEEDS_DEBT');
    const other = sellPlan(ctx, saleOf({}));
    voidSale(ctx, other.id);
    expectDomainError(() => pay(other.id, 100), 'SALE_VOIDED');
    expectDomainError(() => pay(999, 100), 'NOT_FOUND');
  });

  it('voids only the last active payment and restores the debt', () => {
    const sale = sellPlan(ctx, saleOf({}));
    const first = pay(sale.id, 500_000);
    const second = pay(sale.id, 500_000);

    expectDomainError(() => voidPayment(ctx, first.id), 'ONLY_LAST_PAYMENT_VOIDABLE');
    expect(getSale(ctx, sale.id).paidCents).toBe(1_000_000);

    expect(voidPayment(ctx, second.id).voidedAt).not.toBeNull();
    expect(getSale(ctx, sale.id).debtCents).toBe(1_500_000);
    expectDomainError(() => voidPayment(ctx, second.id), 'ALREADY_VOIDED');

    voidPayment(ctx, first.id);
    expect(getSale(ctx, sale.id).debtCents).toBe(2_000_000);
  });

  it('voids a sale only when it has no active payments', () => {
    const sale = sellPlan(ctx, saleOf({}));
    const payment = pay(sale.id, 100_000);
    expectDomainError(() => voidSale(ctx, sale.id), 'SALE_HAS_ACTIVE_PAYMENTS');
    voidPayment(ctx, payment.id);
    const voided = voidSale(ctx, sale.id);
    expect(voided.voidedAt).not.toBeNull();
    expect(voided.debtCents).toBe(0);
    expectDomainError(() => voidSale(ctx, sale.id), 'ALREADY_VOIDED');
  });
});
