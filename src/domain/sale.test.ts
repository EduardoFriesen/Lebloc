import { describe, expect, it } from 'vitest';
import { expectDomainError } from '../test/helpers';
import { buildSaleSnapshot, computeSurcharge, type PlanForSale, type TeacherForSale } from './sale';

const freePlan: PlanForSale = { id: 1, name: 'Pack 8 libres', freePasses: 8, teacherPasses: 0, priceCents: 2_000_000, active: true };
const mixedPlan: PlanForSale = { id: 2, name: 'Pack 4+4', freePasses: 4, teacherPasses: 4, priceCents: 2_000_000, active: true };
const teacher: TeacherForSale = { id: 7, classRateCents: 250_000, active: true };

describe('computeSurcharge', () => {
  it('multiplies teacher passes by the class rate', () => {
    expect(computeSurcharge(4, 250_000)).toBe(1_000_000);
    expect(computeSurcharge(0, 250_000)).toBe(0);
  });
});

describe('buildSaleSnapshot', () => {
  it('snapshots a free plan without teacher', () => {
    expect(buildSaleSnapshot(freePlan, null, 'proportional')).toEqual({
      planId: 1,
      planName: 'Pack 8 libres',
      freePasses: 8,
      teacherPasses: 0,
      localPriceCents: 2_000_000,
      teacherId: null,
      teacherRateCents: 0,
      teacherSurchargeCents: 0,
      totalCents: 2_000_000,
      splitRule: 'proportional',
    });
  });

  it('adds the teacher surcharge to the total', () => {
    const snapshot = buildSaleSnapshot(mixedPlan, teacher, 'teacher_first');
    expect(snapshot.teacherId).toBe(7);
    expect(snapshot.teacherRateCents).toBe(250_000);
    expect(snapshot.teacherSurchargeCents).toBe(1_000_000);
    expect(snapshot.totalCents).toBe(3_000_000);
    expect(snapshot.splitRule).toBe('teacher_first');
  });

  it('requires a teacher when the plan has teacher passes', () => {
    expectDomainError(() => buildSaleSnapshot(mixedPlan, null, 'proportional'), 'TEACHER_REQUIRED');
  });

  it('rejects a teacher when the plan has no teacher passes', () => {
    expectDomainError(() => buildSaleSnapshot(freePlan, teacher, 'proportional'), 'TEACHER_NOT_ALLOWED');
  });

  it('rejects inactive plans and teachers', () => {
    expectDomainError(() => buildSaleSnapshot({ ...freePlan, active: false }, null, 'proportional'), 'INACTIVE_PLAN');
    expectDomainError(() => buildSaleSnapshot(mixedPlan, { ...teacher, active: false }, 'proportional'), 'INACTIVE_TEACHER');
  });
});
