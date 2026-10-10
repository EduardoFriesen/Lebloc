import { beforeEach, describe, expect, it } from 'vitest';
import type { SaleInput } from '../../shared/schemas';
import { adultClient, basicTeacher, createTestContext, freePlan, mixedPlan, type TestContext } from '../test-context';
import { archiveClient, createClient } from './clients';
import { consume } from './consumptions';
import { getDashboard } from './dashboard';
import { registerPayment } from './payments';
import { getTeacherAccount } from './payouts';
import { createPlan } from './plans';
import { sellPlan } from './sales';
import { createTeacher } from './teachers';
import { signWaiver } from './waivers';

describe('debtors and dashboard', () => {
  let ctx: TestContext;
  let anaId: number;
  let freePlanId: number;

  beforeEach(() => {
    ctx = createTestContext();
    anaId = createClient(ctx, adultClient).id;
    freePlanId = createPlan(ctx, freePlan).id;
  });

  function saleOf(overrides: Partial<SaleInput>): SaleInput {
    return {
      clientId: anaId,
      planId: freePlanId,
      teacherId: null,
      splitRule: 'proportional',
      soldAt: '2026-10-05',
      initialPayment: null,
      ...overrides,
    };
  }

  it('shows who has to renew among active clients', () => {
    const single = createPlan(ctx, { ...freePlan, name: 'Pase suelto', freePasses: 1, priceCents: 500_000 });
    sellPlan(ctx, saleOf({ planId: single.id }));
    consume(ctx, { clientId: anaId, kind: 'free', note: null });

    const brunoId = createClient(ctx, { ...adultClient, firstName: 'Bruno', lastName: 'Sierra' }).id;
    const juanId = createTeacher(ctx, basicTeacher).id;
    createTeacher(ctx, { ...basicTeacher, firstName: 'Eva', lastName: 'Bloque' });
    const mixedId = createPlan(ctx, mixedPlan).id;
    sellPlan(ctx, saleOf({ clientId: brunoId, planId: mixedId, teacherId: juanId, initialPayment: { amountCents: 1_500_000, method: 'cash', paidAt: '2026-10-05' } }));

    const carlaId = createClient(ctx, { ...adultClient, firstName: 'Carla', lastName: 'Vía' }).id;
    sellPlan(ctx, saleOf({ clientId: carlaId, planId: single.id }));
    consume(ctx, { clientId: carlaId, kind: 'free', note: null });
    archiveClient(ctx, carlaId);

    const dashboard = getDashboard(ctx);
    expect(dashboard.renewals.map((client) => [client.id, client.passStatus])).toEqual([[anaId, 'none']]);
  });

  it('summarizes clients with passes, debtors once each, pending waivers and the teacher balance', () => {
    sellPlan(ctx, saleOf({}));
    sellPlan(ctx, saleOf({ soldAt: '2026-10-01' }));

    const single = createPlan(ctx, { ...freePlan, name: 'Pase suelto', freePasses: 1, priceCents: 500_000 });
    const brunoId = createClient(ctx, { ...adultClient, firstName: 'Bruno', lastName: 'Sierra' }).id;
    const brunoSale = sellPlan(ctx, saleOf({ clientId: brunoId, planId: single.id }));
    registerPayment(ctx, { saleId: brunoSale.id, amountCents: 500_000, method: 'cash', paidAt: '2026-10-05' });
    consume(ctx, { clientId: brunoId, kind: 'free', note: null });

    const carlaId = createClient(ctx, { ...adultClient, firstName: 'Carla', lastName: 'Vía' }).id;
    sellPlan(ctx, saleOf({ clientId: carlaId }));
    archiveClient(ctx, carlaId);

    const juanId = createTeacher(ctx, basicTeacher).id;
    createTeacher(ctx, { ...basicTeacher, firstName: 'Eva', lastName: 'Bloque' });
    const darioId = createClient(ctx, { ...adultClient, firstName: 'Dario', lastName: 'Toma' }).id;
    const mixedId = createPlan(ctx, mixedPlan).id;
    sellPlan(ctx, saleOf({ clientId: darioId, planId: mixedId, teacherId: juanId, initialPayment: { amountCents: 1_500_000, method: 'cash', paidAt: '2026-10-05' } }));

    // Ana never signed and Dario's waiver expired (12 months by default); Bruno is valid, Carla archived.
    signWaiver(ctx, { clientId: brunoId, signedAt: '2026-10-01' });
    signWaiver(ctx, { clientId: darioId, signedAt: '2025-09-01' });

    expect(getDashboard(ctx).summary).toEqual({
      activeClients: 2,
      debtorCount: 2,
      debtTotalCents: 4_000_000 + 1_500_000,
      pendingWaivers: 2,
      teacherBalanceCents: getTeacherAccount(ctx, juanId).balanceCents,
    });
  });
});
