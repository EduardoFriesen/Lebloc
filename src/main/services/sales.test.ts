import { beforeEach, describe, expect, it } from 'vitest';
import { allocatePayment } from '../../domain/allocation';
import type { SaleExtensionInput, SaleInput } from '../../shared/schemas';
import { expectDomainError } from '../../test/helpers';
import { adultClient, basicTeacher, createTestContext, FAR_EXPIRY, freePlan, mixedPlan, TEST_NOW, type TestContext } from '../test-context';
import { getClientAccount } from './account';
import { archiveClient, createClient, listClients } from './clients';
import { consume } from './consumptions';
import { getDayMovements } from './counter';
import { getFinanceSummary } from './finance';
import { cancelDebt, getPayment, registerPayment, voidDebtCancellation, voidPayment } from './payments';
import { getTeacherAccount } from './payouts';
import { createPlan, updatePlan } from './plans';
import { extendSale, getSale, sellPlan, setSaleExpiry, voidSale } from './sales';
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
      expiresAt: FAR_EXPIRY,
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

  it("sells a mixed plan adding the plan's amount for the teacher", () => {
    expect(sellPlan(ctx, saleOf({ planId: mixedPlanId, teacherId }))).toMatchObject({
      teacherName: 'Juan Pared',
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

  it('rejects sale and payment dates after today', () => {
    expectDomainError(() => sellPlan(ctx, saleOf({ soldAt: '2026-10-06' })), 'DATE_IN_FUTURE');
    expectDomainError(
      () => sellPlan(ctx, saleOf({ initialPayment: { amountCents: 100, method: 'cash', paidAt: '2026-10-06' } })),
      'DATE_IN_FUTURE',
    );
    const sale = sellPlan(ctx, saleOf({}));
    expectDomainError(() => registerPayment(ctx, { saleId: sale.id, amountCents: 100, method: 'cash', paidAt: '2026-10-06' }), 'DATE_IN_FUTURE');
  });

  it('rolls the sale back when the initial payment is invalid', () => {
    expectDomainError(
      () => sellPlan(ctx, saleOf({ initialPayment: { amountCents: 2_000_001, method: 'cash', paidAt: '2026-10-05' } })),
      'PAYMENT_EXCEEDS_DEBT',
    );
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM sales').get()).toEqual({ n: 0 });
  });

  it('keeps the sale snapshot when the plan changes later', () => {
    const sale = sellPlan(ctx, saleOf({ planId: mixedPlanId, teacherId }));
    updatePlan(ctx, { ...mixedPlan, id: mixedPlanId, priceCents: 9_000_000, teacherAmountCents: 4_000_000 });
    expect(getSale(ctx, sale.id)).toMatchObject({ localPriceCents: 2_000_000, teacherSurchargeCents: 1_000_000, totalCents: 3_000_000 });
  });

  it('keeps the expiry chosen at sale time and, past it, loses the passes left but not the debt', () => {
    const sale = sellPlan(ctx, saleOf({ expiresAt: '2026-10-10' }));
    expect(sale).toMatchObject({ expiresAt: '2026-10-10', expired: false, remainingFree: 8 });
    ctx.clock.set(new Date(2026, 9, 10, 21, 0));
    expect(getSale(ctx, sale.id)).toMatchObject({ expired: false, remainingFree: 8 });
    ctx.clock.set(new Date(2026, 9, 11, 9, 0));
    expect(getSale(ctx, sale.id)).toMatchObject({ expired: true, remainingFree: 0, remainingTeacher: 0, debtCents: 2_000_000 });
  });

  it('moves the expiry of a sale, bringing back the passes of an expired one', () => {
    const sale = sellPlan(ctx, saleOf({ expiresAt: '2026-10-10' }));
    ctx.clock.set(new Date(2026, 9, 12, 9, 0));
    expect(getSale(ctx, sale.id)).toMatchObject({ expired: true, remainingFree: 0 });
    expect(setSaleExpiry(ctx, { saleId: sale.id, expiresAt: '2026-10-14' })).toMatchObject({ expiresAt: '2026-10-14', expired: false, remainingFree: 8 });
    // Also earlier, to fix a typo, but never before the sale.
    expect(setSaleExpiry(ctx, { saleId: sale.id, expiresAt: '2026-10-05' })).toMatchObject({ expiresAt: '2026-10-05', expired: true });
    expectDomainError(() => setSaleExpiry(ctx, { saleId: sale.id, expiresAt: '2026-10-04' }), 'EXPIRY_BEFORE_SALE');
  });

  it('keeps the expiry of voided sales and of archived clients', () => {
    const voided = sellPlan(ctx, saleOf({}));
    voidSale(ctx, voided.id);
    expectDomainError(() => setSaleExpiry(ctx, { saleId: voided.id, expiresAt: '2026-12-01' }), 'SALE_VOIDED');
    const archived = sellPlan(ctx, saleOf({}));
    archiveClient(ctx, clientId);
    expectDomainError(() => setSaleExpiry(ctx, { saleId: archived.id, expiresAt: '2026-12-01' }), 'CLIENT_ARCHIVED');
    expectDomainError(() => setSaleExpiry(ctx, { saleId: 999, expiresAt: '2026-12-01' }), 'NOT_FOUND');
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

  it('leaves earlier allocations untouched on a rejected void and allocates new payments from active ones only', () => {
    // total 3_000_000 with a 1_000_000 surcharge: the proportional teacher share is 1/3 and rounds on odd amounts.
    const sale = sellPlan(ctx, saleOf({ planId: mixedPlanId, teacherId, splitRule: 'proportional' }));
    const first = pay(sale.id, 100_001);
    const second = pay(sale.id, 100_001);
    expect([first.teacherCents, second.teacherCents]).toEqual([33_334, 33_333]);
    const firstBefore = getPayment(ctx, first.id);

    expectDomainError(() => voidPayment(ctx, first.id), 'ONLY_LAST_PAYMENT_VOIDABLE');
    expect(getPayment(ctx, first.id)).toEqual(firstBefore);

    voidPayment(ctx, second.id);
    const third = pay(sale.id, 50_000);
    const expected = allocatePayment({
      totalCents: 3_000_000,
      surchargeCents: 1_000_000,
      splitRule: 'proportional',
      allocatedLocalCents: firstBefore.localCents,
      allocatedTeacherCents: firstBefore.teacherCents,
      amountCents: 50_000,
    });
    expect({ localCents: third.localCents, teacherCents: third.teacherCents }).toEqual(expected);
    // Active teacher total is the rounded cumulative share of what is really paid (150_001), not drifted by the voided payment.
    expect(firstBefore.teacherCents + third.teacherCents).toBe(Math.round((150_001 * 1_000_000) / 3_000_000));
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

  describe('cancelDebt', () => {
    const october = { from: '2026-10-01', to: '2026-10-31' };

    it("forgives what is owed, the teacher's part included, without counting it as income", () => {
      const sale = sellPlan(ctx, saleOf({ planId: mixedPlanId, teacherId, initialPayment: { amountCents: 1_000_000, method: 'cash', paidAt: '2026-10-05' } }));
      const income = getFinanceSummary(ctx, october).current;
      const owedToTeacher = getTeacherAccount(ctx, teacherId).balanceCents;

      const cancellation = cancelDebt(ctx, { saleId: sale.id });

      expect(cancellation).toMatchObject({ saleId: sale.id, amountCents: sale.debtCents, cancelledAt: TEST_NOW.toISOString(), voidedAt: null });
      expect(getSale(ctx, sale.id)).toMatchObject({ paidCents: 1_000_000, cancelledCents: sale.debtCents, debtCents: 0 });
      expect(getClientAccount(ctx, clientId)).toMatchObject({ debtCents: 0, cancellations: [cancellation] });
      expect(listClients(ctx, { search: '', includeArchived: false, onlyDebtors: true, onlyWithPasses: false, onlyPendingWaiver: false })).toEqual([]);
      expect(getDayMovements(ctx).rows).toMatchObject([{ kind: 'plan', amountCents: 1_000_000, debtCents: 0 }]);
      expect(getFinanceSummary(ctx, october).current).toEqual(income);
      expect(getTeacherAccount(ctx, teacherId).balanceCents).toBe(owedToTeacher);
    });

    it('brings the debt back when the cancellation is voided, once', () => {
      const sale = sellPlan(ctx, saleOf({}));
      const cancellation = cancelDebt(ctx, { saleId: sale.id });
      expect(voidDebtCancellation(ctx, cancellation.id).voidedAt).not.toBeNull();
      expect(getSale(ctx, sale.id)).toMatchObject({ cancelledCents: 0, debtCents: 2_000_000 });
      expectDomainError(() => voidDebtCancellation(ctx, cancellation.id), 'ALREADY_VOIDED');
    });

    it('rejects cancelling a sale that owes nothing, and paying a cancelled debt', () => {
      const sale = sellPlan(ctx, saleOf({}));
      cancelDebt(ctx, { saleId: sale.id });
      expectDomainError(() => cancelDebt(ctx, { saleId: sale.id }), 'NO_DEBT_TO_CANCEL');
      expectDomainError(() => pay(sale.id, 100_000), 'PAYMENT_EXCEEDS_DEBT');
    });

    it('voids the sale or extends it only after voiding the cancellation', () => {
      const sale = sellPlan(ctx, saleOf({ planId: mixedPlanId, teacherId }));
      const cancellation = cancelDebt(ctx, { saleId: sale.id });
      expectDomainError(() => voidSale(ctx, sale.id), 'SALE_HAS_ACTIVE_CANCELLATIONS');
      expectDomainError(
        () => extendSale(ctx, { saleId: sale.id, planId: freePlanId, teacherId: null, splitRule: 'proportional', expiresAt: FAR_EXPIRY, payment: null }),
        'DEBT_CANCELLED',
      );
      voidDebtCancellation(ctx, cancellation.id);
      expect(voidSale(ctx, sale.id).voidedAt).not.toBeNull();
    });
  });

  describe('extendSale', () => {
    let trialPlanId: number;

    beforeEach(() => {
      trialPlanId = createPlan(ctx, { name: 'Pase libre suelto', freePasses: 1, teacherPasses: 0, priceCents: 700_000, teacherAmountCents: 0, active: true }).id;
    });

    /** A paid trial whose only class was already taken. */
    function trial(overrides: Partial<SaleInput> = {}) {
      const sale = sellPlan(
        ctx,
        saleOf({ planId: trialPlanId, initialPayment: { amountCents: 700_000, method: 'cash', paidAt: '2026-10-05' }, ...overrides }),
      );
      consume(ctx, { clientId, kind: 'free', note: null });
      return sale;
    }

    function extension(saleId: number, overrides: Partial<SaleExtensionInput> = {}): SaleExtensionInput {
      return { saleId, planId: freePlanId, teacherId: null, splitRule: 'proportional', expiresAt: FAR_EXPIRY, payment: null, ...overrides };
    }

    function extensionRows() {
      return ctx.db.prepare('SELECT * FROM sale_extensions ORDER BY id').all();
    }

    it('a used trial extended to Pack 8 keeps its payment and its pass: 7 left, the debt drops by what was paid', () => {
      const sale = trial();
      expect(extendSale(ctx, extension(sale.id))).toMatchObject({
        id: sale.id,
        planName: 'Pack 8 libres',
        soldAt: '2026-10-05',
        totalCents: 2_000_000,
        paidCents: 700_000,
        debtCents: 1_300_000,
        remainingFree: 7,
        extendedFrom: { planName: 'Pase libre suelto', extendedAt: TEST_NOW.toISOString() },
      });
    });

    it('a free trial extended to a mixed plan takes the chosen teacher and its amount', () => {
      const sale = trial();
      expect(extendSale(ctx, extension(sale.id, { planId: mixedPlanId, teacherId }))).toMatchObject({
        teacherId,
        teacherSurchargeCents: 1_000_000,
        totalCents: 3_000_000,
      });
    });

    it('keeps the previous plan and prices', () => {
      const sale = trial();
      extendSale(ctx, extension(sale.id));
      expect(extensionRows()).toEqual([
        expect.objectContaining({
          sale_id: sale.id,
          from_plan_id: trialPlanId,
          from_plan_name: 'Pase libre suelto',
          from_free_passes: 1,
          from_teacher_passes: 0,
          from_local_price_cents: 700_000,
          from_teacher_surcharge_cents: 0,
        }),
      ]);
    });

    it('charges a payment in the same step', () => {
      const sale = trial();
      const payment = { amountCents: 1_300_000, method: 'transfer' as const, paidAt: '2026-10-05' };
      expect(extendSale(ctx, extension(sale.id, { payment }))).toMatchObject({ paidCents: 2_000_000, debtCents: 0 });
    });

    it('a payment that fails leaves the sale as it was', () => {
      const sale = trial();
      const payment = { amountCents: 1_300_001, method: 'cash' as const, paidAt: '2026-10-05' };
      expectDomainError(() => extendSale(ctx, extension(sale.id, { payment })), 'PAYMENT_EXCEEDS_DEBT');
      expect(getSale(ctx, sale.id)).toMatchObject({ planName: 'Pase libre suelto', totalCents: 700_000, extendedFrom: null });
      expect(extensionRows()).toEqual([]);
    });

    it('extending twice records the plan it came from each time', () => {
      const sale = trial();
      extendSale(ctx, extension(sale.id));
      const twice = extendSale(ctx, extension(sale.id, { planId: mixedPlanId, teacherId }));
      expect(twice.extendedFrom?.planName).toBe('Pack 8 libres');
      expect(extensionRows()).toHaveLength(2);
    });

    it('a sale that expires today can still be extended', () => {
      const sale = trial({ expiresAt: '2026-10-05' });
      expect(extendSale(ctx, extension(sale.id, { expiresAt: '2026-10-05' })).planName).toBe('Pack 8 libres');
    });

    it('an archived client cannot extend', () => {
      const sale = trial();
      archiveClient(ctx, clientId);
      expectDomainError(() => extendSale(ctx, extension(sale.id)), 'CLIENT_ARCHIVED');
    });

    it('the expiry may not be before the sale', () => {
      const sale = trial();
      expectDomainError(() => extendSale(ctx, extension(sale.id, { expiresAt: '2026-10-04' })), 'EXPIRY_BEFORE_SALE');
    });
  });
});
