import { beforeEach, describe, expect, it } from 'vitest';
import type { SaleInput } from '../../shared/schemas';
import { adultClient, basicTeacher, createTestContext, freePlan, mixedPlan, type TestContext } from '../test-context';
import { archiveClient, createClient } from './clients';
import { getDashboard, listDebtors } from './dashboard';
import { createPlan } from './plans';
import { sellPlan, voidSale } from './sales';
import { createTeacher } from './teachers';

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

  it('lists debtors oldest first with days since sale, excluding settled and voided sales', () => {
    const unpaid = sellPlan(ctx, saleOf({ soldAt: '2026-09-05' }));
    sellPlan(ctx, saleOf({ soldAt: '2026-10-01', initialPayment: { amountCents: 2_000_000, method: 'cash', paidAt: '2026-10-01' } }));
    voidSale(ctx, sellPlan(ctx, saleOf({ soldAt: '2026-09-20' })).id);
    const partial = sellPlan(ctx, saleOf({ soldAt: '2026-10-03', initialPayment: { amountCents: 500_000, method: 'cash', paidAt: '2026-10-03' } }));

    expect(listDebtors(ctx)).toEqual([
      { saleId: unpaid.id, clientId: anaId, clientName: 'Ana Roca', planName: 'Pack 8 libres', soldAt: '2026-09-05', totalCents: 2_000_000, debtCents: 2_000_000, daysSinceSale: 30 },
      { saleId: partial.id, clientId: anaId, clientName: 'Ana Roca', planName: 'Pack 8 libres', soldAt: '2026-10-03', totalCents: 2_000_000, debtCents: 1_500_000, daysSinceSale: 2 },
    ]);
  });

  it('shows low-pass alerts for active clients and only non-zero teacher balances', () => {
    const single = createPlan(ctx, { ...freePlan, name: 'Pase suelto', freePasses: 1, priceCents: 500_000 });
    sellPlan(ctx, saleOf({ planId: single.id }));

    const brunoId = createClient(ctx, { ...adultClient, firstName: 'Bruno', lastName: 'Sierra' }).id;
    const juanId = createTeacher(ctx, basicTeacher).id;
    createTeacher(ctx, { ...basicTeacher, firstName: 'Eva', lastName: 'Bloque' });
    const mixedId = createPlan(ctx, mixedPlan).id;
    sellPlan(ctx, saleOf({ clientId: brunoId, planId: mixedId, teacherId: juanId, initialPayment: { amountCents: 1_500_000, method: 'cash', paidAt: '2026-10-05' } }));

    const carlaId = createClient(ctx, { ...adultClient, firstName: 'Carla', lastName: 'Vía' }).id;
    sellPlan(ctx, saleOf({ clientId: carlaId, planId: single.id }));
    archiveClient(ctx, carlaId);

    const dashboard = getDashboard(ctx);
    expect(dashboard.lowPasses).toEqual([{ clientId: anaId, clientName: 'Ana Roca', remainingFree: 1, remainingTeacher: 0 }]);
    expect(dashboard.teacherBalances.map((balance) => balance.teacherName)).toEqual(['Juan Pared']);
    expect(dashboard.debtors.map((debtor) => debtor.clientName)).toEqual(['Ana Roca', 'Bruno Sierra', 'Carla Vía']);
  });
});
