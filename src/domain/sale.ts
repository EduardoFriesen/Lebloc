import { DomainError } from './errors';

export type SplitRule = 'proportional' | 'teacher_first' | 'local_first';
export const SPLIT_RULES: readonly SplitRule[] = ['proportional', 'teacher_first', 'local_first'];

export interface PlanForSale {
  id: number;
  name: string;
  freePasses: number;
  teacherPasses: number;
  priceCents: number;
  active: boolean;
}

export interface TeacherForSale {
  id: number;
  classRateCents: number;
  active: boolean;
}

export interface SaleSnapshot {
  planId: number;
  planName: string;
  freePasses: number;
  teacherPasses: number;
  localPriceCents: number;
  teacherId: number | null;
  teacherRateCents: number;
  teacherSurchargeCents: number;
  totalCents: number;
  splitRule: SplitRule;
}

export function computeSurcharge(teacherPasses: number, rateCents: number): number {
  return teacherPasses * rateCents;
}

export function buildSaleSnapshot(plan: PlanForSale, teacher: TeacherForSale | null, splitRule: SplitRule): SaleSnapshot {
  if (!plan.active) throw new DomainError('INACTIVE_PLAN');
  if (plan.teacherPasses > 0 && !teacher) throw new DomainError('TEACHER_REQUIRED');
  if (plan.teacherPasses === 0 && teacher) throw new DomainError('TEACHER_NOT_ALLOWED');
  if (teacher && !teacher.active) throw new DomainError('INACTIVE_TEACHER');

  const teacherRateCents = teacher?.classRateCents ?? 0;
  const teacherSurchargeCents = computeSurcharge(plan.teacherPasses, teacherRateCents);
  return {
    planId: plan.id,
    planName: plan.name,
    freePasses: plan.freePasses,
    teacherPasses: plan.teacherPasses,
    localPriceCents: plan.priceCents,
    teacherId: teacher?.id ?? null,
    teacherRateCents,
    teacherSurchargeCents,
    totalCents: plan.priceCents + teacherSurchargeCents,
    splitRule,
  };
}
