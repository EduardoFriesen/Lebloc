import { beforeEach, describe, expect, it } from 'vitest';
import { expectDomainError } from '../../test/helpers';
import { createTestContext, freePlan, mixedPlan, type TestContext } from '../test-context';
import { createPlan, getPlan, listPlans, updatePlan } from './plans';

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
});
