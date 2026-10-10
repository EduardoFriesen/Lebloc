import { DomainError } from '../../domain/errors';
import type { PlanInput, PlanUpdate } from '../../shared/schemas';
import type { Enrollment, Plan } from '../../shared/types';
import type { Context } from '../context';
import * as repo from '../repos/plans';
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
