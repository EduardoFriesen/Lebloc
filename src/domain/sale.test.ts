import { describe, expect, it } from 'vitest';
import { expectDomainError } from '../test/helpers';
import { buildSaleSnapshot, type PlanForSale, type TeacherForSale } from './sale';

const freePlan: PlanForSale = { id: 1, name: 'Pack 8 libres', freePasses: 8, teacherPasses: 0, priceCents: 2_000_000, teacherAmountCents: 0, active: true };
const mixedPlan: PlanForSale = { id: 2, name: 'Pack 4+4', freePasses: 4, teacherPasses: 4, priceCents: 2_000_000, teacherAmountCents: 1_000_000, active: true };
const teacher: TeacherForSale = { id: 7, active: true };

describe('buildSaleSnapshot', () => {
  it('snapshots a free plan without teacher', () => {
    expect(buildSaleSnapshot(freePlan, null, 'proportional')).toEqual({
      planId: 1,
      planName: 'Pack 8 libres',
      freePasses: 8,
      teacherPasses: 0,
      localPriceCents: 2_000_000,
      teacherId: null,
      teacherSurchargeCents: 0,
      totalCents: 2_000_000,
      splitRule: 'proportional',
    });
  });

  it("adds the plan's amount for the teacher to the total", () => {
    const snapshot = buildSaleSnapshot(mixedPlan, teacher, 'teacher_first');
    expect(snapshot.teacherId).toBe(7);
    expect(snapshot.teacherSurchargeCents).toBe(1_000_000);
    expect(snapshot.totalCents).toBe(3_000_000);
    expect(snapshot.splitRule).toBe('teacher_first');
  });

  it('requires a teacher when the plan has teacher passes', () => {
    expectDomainError(() => buildSaleSnapshot(mixedPlan, null, 'proportional'), 'TEACHER_REQUIRED');
  });

  it('rejects a plan with teacher passes and no amount for the teacher', () => {
    expectDomainError(() => buildSaleSnapshot({ ...mixedPlan, teacherAmountCents: 0 }, null, 'proportional'), 'TEACHER_AMOUNT_MISSING');
  });

  it('rejects a teacher when the plan has no teacher passes', () => {
    expectDomainError(() => buildSaleSnapshot(freePlan, teacher, 'proportional'), 'TEACHER_NOT_ALLOWED');
  });

  it('rejects inactive plans and teachers', () => {
    expectDomainError(() => buildSaleSnapshot({ ...freePlan, active: false }, null, 'proportional'), 'INACTIVE_PLAN');
    expectDomainError(() => buildSaleSnapshot(mixedPlan, { ...teacher, active: false }, 'proportional'), 'INACTIVE_TEACHER');
  });
});
