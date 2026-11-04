import { beforeEach, describe, expect, it } from 'vitest';
import type { SaleInput } from '../../shared/schemas';
import { setSetting } from '../repos/settings';
import { adultClient, basicTeacher, createTestContext, FAR_EXPIRY, freePlan, mixedPlan, type TestContext } from '../test-context';
import { archiveClient, createClient } from './clients';
import { consume } from './consumptions';
import { getDashboard } from './dashboard';
import { registerPayment } from './payments';
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
      expiresAt: FAR_EXPIRY,
      initialPayment: null,
      ...overrides,
    };
  }

  it('lists the debtors who came in today, oldest debt first', () => {
    const named = (firstName: string) => createClient(ctx, { ...adultClient, firstName, lastName: 'Test' }).id;
    const [brunoId, carlaId, daniId, evaId] = [named('Bruno'), named('Carla'), named('Dani'), named('Eva')];
    const paid = { amountCents: freePlan.priceCents, method: 'cash' as const, paidAt: '2026-10-05' };

    // Came yesterday: not today's debtor.
    sellPlan(ctx, saleOf({ clientId: evaId, soldAt: '2026-10-01' }));
    const now = ctx.clock.now();
    ctx.clock.set(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 20));
    consume(ctx, { clientId: evaId, kind: 'free', note: null });
    ctx.clock.set(now);

    sellPlan(ctx, saleOf({ soldAt: '2026-10-04' }));
    consume(ctx, { clientId: anaId, kind: 'free', note: null });
    sellPlan(ctx, saleOf({ clientId: brunoId, soldAt: '2026-10-02' }));
    consume(ctx, { clientId: brunoId, kind: 'free', note: null });
    // Paid in full, owes nothing.
    sellPlan(ctx, saleOf({ clientId: carlaId, initialPayment: paid }));
    consume(ctx, { clientId: carlaId, kind: 'free', note: null });
    // Archived clients drop off every list.
    sellPlan(ctx, saleOf({ clientId: daniId }));
    consume(ctx, { clientId: daniId, kind: 'free', note: null });
    archiveClient(ctx, daniId);

    expect(getDashboard(ctx).todayDebtors.map((client) => client.id)).toEqual([brunoId, anaId]);
  });

  it('summarizes clients with passes, debtors once each and pending waivers', () => {
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

    // Ana and Dario never handed it in; Bruno's old one still counts, Carla is archived.
    signWaiver(ctx, { clientId: brunoId, signedAt: '2015-10-01' });

    expect(getDashboard(ctx).summary).toEqual({
      activeClients: 2,
      debtorCount: 2,
      debtTotalCents: 4_000_000 + 1_500_000,
      pendingWaivers: 2,
      externalBackupFailed: false,
    });
  });

  it('warns when a backup could not leave the PC, to the pendrive or to Google Drive', () => {
    setSetting(ctx.db, 'backup_drive_error', 'No se pudo subir el backup a Google Drive.');
    expect(getDashboard(ctx).summary.externalBackupFailed).toBe(true);
  });
});
