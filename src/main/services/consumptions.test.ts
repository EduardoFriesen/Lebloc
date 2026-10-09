import { beforeEach, describe, expect, it } from 'vitest';
import type { SaleInput } from '../../shared/schemas';
import { expectDomainError } from '../../test/helpers';
import { adultClient, basicTeacher, createTestContext, freePlan, mixedPlan, TEST_NOW, type TestContext } from '../test-context';
import { getClientAccount } from './account';
import { archiveClient, createClient } from './clients';
import { consume, voidConsumption } from './consumptions';
import { createPlan } from './plans';
import { getSale, sellPlan, voidSale } from './sales';
import { getSettings, updateSettings } from './settings';
import { createTeacher } from './teachers';

describe('consumptions and client account', () => {
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

  const useFree = () => consume(ctx, { clientId, kind: 'free', note: null });

  it('consumes from the oldest sale with passes of that kind (FIFO)', () => {
    const newer = sellPlan(ctx, saleOf({ soldAt: '2026-10-01' }));
    const older = sellPlan(ctx, saleOf({ soldAt: '2026-09-01' }));
    const consumption = useFree();
    expect(consumption).toMatchObject({ saleId: older.id, kind: 'free', consumedAt: TEST_NOW.toISOString(), voidedAt: null });
    expect(getSale(ctx, older.id).remainingFree).toBe(7);
    expect(getSale(ctx, newer.id).remainingFree).toBe(8);
  });

  it('skips voided sales even when they are the oldest', () => {
    const voided = sellPlan(ctx, saleOf({ soldAt: '2026-08-01' }));
    voidSale(ctx, voided.id);
    const active = sellPlan(ctx, saleOf({ soldAt: '2026-09-01' }));
    expect(useFree().saleId).toBe(active.id);
  });

  it('fails when no passes of the requested kind remain', () => {
    expectDomainError(useFree, 'NO_PASSES_AVAILABLE');
    sellPlan(ctx, saleOf({}));
    expectDomainError(() => consume(ctx, { clientId, kind: 'teacher', note: null }), 'NO_PASSES_AVAILABLE');
    const single = createPlan(ctx, { ...freePlan, name: 'Pase suelto', freePasses: 1 });
    const otherClient = createClient(ctx, { ...adultClient, firstName: 'Bruno' }).id;
    sellPlan(ctx, saleOf({ clientId: otherClient, planId: single.id }));
    consume(ctx, { clientId: otherClient, kind: 'free', note: null });
    expectDomainError(() => consume(ctx, { clientId: otherClient, kind: 'free', note: null }), 'NO_PASSES_AVAILABLE');
  });

  it('rejects consumptions for archived clients', () => {
    sellPlan(ctx, saleOf({}));
    archiveClient(ctx, clientId);
    expectDomainError(useFree, 'CLIENT_ARCHIVED');
  });

  it('voids a consumption once, giving the pass back', () => {
    const sale = sellPlan(ctx, saleOf({}));
    const consumption = useFree();
    expect(voidConsumption(ctx, consumption.id).voidedAt).not.toBeNull();
    expect(getSale(ctx, sale.id).remainingFree).toBe(8);
    expectDomainError(() => voidConsumption(ctx, consumption.id), 'ALREADY_VOIDED');
    expectDomainError(() => voidConsumption(ctx, 999), 'NOT_FOUND');
  });

  it('blocks voiding a sale that has active consumptions', () => {
    const sale = sellPlan(ctx, saleOf({}));
    useFree();
    expectDomainError(() => voidSale(ctx, sale.id), 'SALE_HAS_ACTIVE_CONSUMPTIONS');
  });

  it('builds the client account with totals and the low-passes flag', () => {
    expect(getClientAccount(ctx, clientId)).toMatchObject({ sales: [], remainingFree: 0, debtCents: 0, lowOnPasses: false });

    sellPlan(
      ctx,
      saleOf({ planId: mixedPlanId, teacherId, initialPayment: { amountCents: 1_000_000, method: 'cash', paidAt: '2026-10-05' } }),
    );
    for (let i = 0; i < 4; i += 1) useFree();
    consume(ctx, { clientId, kind: 'teacher', note: 'Clase de técnica' });

    const account = getClientAccount(ctx, clientId);
    expect(account).toMatchObject({ remainingFree: 0, remainingTeacher: 3, debtCents: 2_000_000, lowOnPasses: false });
    expect(account.payments).toHaveLength(1);
    expect(account.consumptions).toHaveLength(5);

    consume(ctx, { clientId, kind: 'teacher', note: null });
    expect(getClientAccount(ctx, clientId)).toMatchObject({ remainingTeacher: 2, lowOnPasses: true });
  });

  it('reads and updates the low-passes threshold', () => {
    expect(getSettings(ctx)).toEqual({ lowPassesThreshold: 2, waiverValidityMonths: 12 });
    sellPlan(ctx, saleOf({}));
    expect(getClientAccount(ctx, clientId).lowOnPasses).toBe(false);
    expect(updateSettings(ctx, { lowPassesThreshold: 8, waiverValidityMonths: 6 })).toEqual({ lowPassesThreshold: 8, waiverValidityMonths: 6 });
    expect(getClientAccount(ctx, clientId).lowOnPasses).toBe(true);
  });
});
