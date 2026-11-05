import { DomainError } from '../../domain/errors';
import type { PlanInput, PlanSalesInput, PlanUpdate } from '../../shared/schemas';
import type { Enrollment, Plan, PlanSale } from '../../shared/types';
import { type Context, today } from '../context';
import { monthBounds } from '../repos/expenses';
import * as repo from '../repos/plans';
import * as saleStats from '../repos/saleStats';
import { listEnrollments } from './enrollments';

export function getPlan(ctx: Context, id: number): Plan {
  const plan = repo.findPlan(ctx.db, id);
  if (!plan) throw new DomainError('NOT_FOUND');
  return plan;
}

export function listPlans(ctx: Context, includeInactive: boolean): Plan[] {
  return repo.listPlans(ctx.db, includeInactive);
}

export function createPlan(ctx: Context, input: PlanInput): Plan {
  return getPlan(ctx, repo.insertPlan(ctx.db, input));
}

export function updatePlan(ctx: Context, input: PlanUpdate): Plan {
  getPlan(ctx, input.id);
  repo.updatePlan(ctx.db, input.id, input);
  return getPlan(ctx, input.id);
}

export function getPlanEnrollments(ctx: Context, planId: number): Enrollment[] {
  getPlan(ctx, planId);
  return listEnrollments(ctx, { planId });
}

export function listPlanSales(ctx: Context, { month, planId }: PlanSalesInput): PlanSale[] {
  if (planId !== undefined) getPlan(ctx, planId);
  return saleStats.listPlanSales(ctx.db, { ...monthBounds(month), planId: planId ?? null, today: today(ctx) });
}
