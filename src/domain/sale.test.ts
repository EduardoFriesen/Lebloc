import { describe, expect, it } from 'vitest';
import { expectDomainError } from '../test/helpers';
import {
  buildExtension,
  buildSaleSnapshot,
  extensionKindError,
  extensionStateOf,
  type PlanForSale,
  type SaleForExtension,
  type TeacherForSale,
} from './sale';

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

describe('buildExtension', () => {
  const teacherOnlyPlan: PlanForSale = { id: 3, name: 'Escuelita', freePasses: 0, teacherPasses: 4, priceCents: 2_000_000, teacherAmountCents: 1_200_000, active: true };
  const trial: SaleForExtension = { planId: 9, teacherId: null, voided: false, expired: false, used: { free: 1, teacher: 0 }, allocatedLocalCents: 700_000, allocatedTeacherCents: 0 };
  const withTeacher: SaleForExtension = { planId: 9, teacherId: 7, voided: false, expired: false, used: { free: 0, teacher: 1 }, allocatedLocalCents: 300_000, allocatedTeacherCents: 200_000 };

  it('extends a used free trial to a free plan with the plan as it is sold today', () => {
    expect(buildExtension(trial, freePlan, null, 'proportional')).toEqual(buildSaleSnapshot(freePlan, null, 'proportional'));
  });

  it('extends a free trial to a mixed plan with the teacher chosen now', () => {
    const snapshot = buildExtension(trial, mixedPlan, teacher, 'proportional');
    expect(snapshot.teacherId).toBe(7);
    expect(snapshot.totalCents).toBe(3_000_000);
  });

  it('extends a sale with a teacher to another teacher plan keeping the teacher', () => {
    expect(buildExtension(withTeacher, mixedPlan, teacher, 'proportional').teacherSurchargeCents).toBe(1_000_000);
  });

  it('rejects voided and expired sales', () => {
    expectDomainError(() => buildExtension({ ...trial, voided: true }, freePlan, null, 'proportional'), 'SALE_VOIDED');
    expectDomainError(() => buildExtension({ ...trial, expired: true }, freePlan, null, 'proportional'), 'SALE_EXPIRED');
  });

  it('rejects extending to the plan the sale already has', () => {
    expectDomainError(() => buildExtension({ ...trial, planId: 1 }, freePlan, null, 'proportional'), 'SAME_PLAN');
  });

  it('never changes the teacher of the sale', () => {
    expectDomainError(() => buildExtension(withTeacher, mixedPlan, { id: 8, active: true }, 'proportional'), 'TEACHER_CHANGE_NOT_ALLOWED');
    expectDomainError(() => buildExtension(withTeacher, mixedPlan, null, 'proportional'), 'TEACHER_CHANGE_NOT_ALLOWED');
  });

  it('keeps sales with a teacher on plans with teacher passes', () => {
    expectDomainError(() => buildExtension(withTeacher, freePlan, null, 'proportional'), 'EXTENSION_NEEDS_TEACHER_PLAN');
  });

  it('keeps free sales on plans with free passes', () => {
    expectDomainError(() => buildExtension(trial, teacherOnlyPlan, teacher, 'proportional'), 'EXTENSION_NEEDS_FREE_PASSES');
  });

  it('rejects a plan the used passes do not fit in', () => {
    expectDomainError(() => buildExtension({ ...withTeacher, used: { free: 1, teacher: 1 } }, teacherOnlyPlan, teacher, 'proportional'), 'USED_PASSES_DONT_FIT');
  });

  it('rejects a plan whose parts are smaller than what was already allocated to them', () => {
    expectDomainError(() => buildExtension({ ...trial, allocatedLocalCents: 2_000_001 }, freePlan, null, 'proportional'), 'PAID_EXCEEDS_PLAN');
    expectDomainError(() => buildExtension({ ...withTeacher, allocatedTeacherCents: 1_000_001 }, mixedPlan, teacher, 'proportional'), 'PAID_EXCEEDS_PLAN');
  });

  it("rejects extending with the sale's teacher once inactive", () => {
    expectDomainError(() => buildExtension(withTeacher, mixedPlan, { id: 7, active: false }, 'proportional'), 'INACTIVE_TEACHER');
  });
});

describe('extensionStateOf', () => {
  it('counts used passes and only the active payments', () => {
    const sale = { planId: 1, teacherId: null, voidedAt: null, expired: false, freePasses: 8, teacherPasses: 0, remainingFree: 6, remainingTeacher: 0 };
    const payments = [
      { localCents: 700_000, teacherCents: 0, voidedAt: null },
      { localCents: 500_000, teacherCents: 0, voidedAt: '2026-10-06T10:00:00.000Z' },
    ];
    expect(extensionStateOf(sale, payments)).toEqual({
      planId: 1,
      teacherId: null,
      voided: false,
      expired: false,
      used: { free: 2, teacher: 0 },
      allocatedLocalCents: 700_000,
      allocatedTeacherCents: 0,
    });
  });
});

describe('extensionKindError', () => {
  it('tells which plans a free sale can be extended to', () => {
    const teacherOnly = { id: 3, freePasses: 0, teacherPasses: 4 };
    expect(extensionKindError({ planId: 9, teacherId: null }, teacherOnly)).toBe('EXTENSION_NEEDS_FREE_PASSES');
    expect(extensionKindError({ planId: 9, teacherId: null }, freePlan)).toBeNull();
  });
});
