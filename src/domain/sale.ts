import { DomainError } from './errors';
import type { PassCounts } from './passes';

export type SplitRule = 'proportional' | 'teacher_first' | 'local_first';
export const SPLIT_RULES: readonly SplitRule[] = ['proportional', 'teacher_first', 'local_first'];

export interface PlanForSale {
  id: number;
  name: string;
  freePasses: number;
  teacherPasses: number;
  priceCents: number;
  /** What the teacher gets for all the plan's teacher passes, charged on top of the price. */
  teacherAmountCents: number;
  active: boolean;
}

export interface TeacherForSale {
  id: number;
  active: boolean;
}

export interface SaleSnapshot {
  planId: number;
  planName: string;
  freePasses: number;
  teacherPasses: number;
  localPriceCents: number;
  teacherId: number | null;
  teacherSurchargeCents: number;
  totalCents: number;
  splitRule: SplitRule;
}

export function buildSaleSnapshot(plan: PlanForSale, teacher: TeacherForSale | null, splitRule: SplitRule): SaleSnapshot {
  if (!plan.active) throw new DomainError('INACTIVE_PLAN');
  if (plan.teacherPasses > 0 && plan.teacherAmountCents <= 0) throw new DomainError('TEACHER_AMOUNT_MISSING');
  if (plan.teacherPasses > 0 && !teacher) throw new DomainError('TEACHER_REQUIRED');
  if (plan.teacherPasses === 0 && teacher) throw new DomainError('TEACHER_NOT_ALLOWED');
  if (teacher && !teacher.active) throw new DomainError('INACTIVE_TEACHER');

  const teacherSurchargeCents = plan.teacherPasses > 0 ? plan.teacherAmountCents : 0;
  return {
    planId: plan.id,
    planName: plan.name,
    freePasses: plan.freePasses,
    teacherPasses: plan.teacherPasses,
    localPriceCents: plan.priceCents,
    teacherId: teacher?.id ?? null,
    teacherSurchargeCents,
    totalCents: plan.priceCents + teacherSurchargeCents,
    splitRule,
  };
}

/** A sold sale as an extension sees it: what it is now, what was used and what its payments already allocated. */
export interface SaleForExtension {
  planId: number;
  teacherId: number | null;
  voided: boolean;
  expired: boolean;
  used: PassCounts;
  allocatedLocalCents: number;
  allocatedTeacherCents: number;
  cancelledCents: number;
}

export function extensionStateOf(
  sale: {
    planId: number;
    teacherId: number | null;
    voidedAt: string | null;
    expired: boolean;
    freePasses: number;
    teacherPasses: number;
    remainingFree: number;
    remainingTeacher: number;
    cancelledCents: number;
  },
  payments: readonly { localCents: number; teacherCents: number; voidedAt: string | null }[],
): SaleForExtension {
  const active = payments.filter((payment) => payment.voidedAt === null);
  return {
    planId: sale.planId,
    teacherId: sale.teacherId,
    voided: sale.voidedAt !== null,
    expired: sale.expired,
    used: { free: sale.freePasses - sale.remainingFree, teacher: sale.teacherPasses - sale.remainingTeacher },
    allocatedLocalCents: active.reduce((sum, payment) => sum + payment.localCents, 0),
    allocatedTeacherCents: active.reduce((sum, payment) => sum + payment.teacherCents, 0),
    cancelledCents: sale.cancelledCents,
  };
}

/** Same plan or wrong kind: the plans the dialog must not offer. The teacher stays, so it decides the kind. */
export function extensionKindError(
  sale: Pick<SaleForExtension, 'planId' | 'teacherId'>,
  plan: Pick<PlanForSale, 'id' | 'freePasses' | 'teacherPasses'>,
): 'SAME_PLAN' | 'EXTENSION_NEEDS_TEACHER_PLAN' | 'EXTENSION_NEEDS_FREE_PASSES' | null {
  if (plan.id === sale.planId) return 'SAME_PLAN';
  if (sale.teacherId !== null && plan.teacherPasses === 0) return 'EXTENSION_NEEDS_TEACHER_PLAN';
  if (sale.teacherId === null && plan.freePasses === 0) return 'EXTENSION_NEEDS_FREE_PASSES';
  return null;
}

/**
 * The snapshot a sale takes when it becomes another plan. Payments are not reallocated, so each part of the new
 * plan has to hold what was already allocated to it, and the passes used have to fit in it.
 */
export function buildExtension(sale: SaleForExtension, plan: PlanForSale, teacher: TeacherForSale | null, splitRule: SplitRule): SaleSnapshot {
  if (sale.voided) throw new DomainError('SALE_VOIDED');
  if (sale.expired) throw new DomainError('SALE_EXPIRED');
  // Whether the forgiven amount should come off the new plan is the admin's call: void the cancellation first.
  if (sale.cancelledCents > 0) throw new DomainError('DEBT_CANCELLED');
  const kindError = extensionKindError(sale, plan);
  if (kindError) throw new DomainError(kindError);
  if (sale.teacherId !== null && teacher?.id !== sale.teacherId) throw new DomainError('TEACHER_CHANGE_NOT_ALLOWED');
  const snapshot = buildSaleSnapshot(plan, teacher, splitRule);
  if (sale.used.free > snapshot.freePasses || sale.used.teacher > snapshot.teacherPasses) throw new DomainError('USED_PASSES_DONT_FIT');
  if (sale.allocatedLocalCents > snapshot.localPriceCents || sale.allocatedTeacherCents > snapshot.teacherSurchargeCents) {
    throw new DomainError('PAID_EXCEEDS_PLAN');
  }
  return snapshot;
}
