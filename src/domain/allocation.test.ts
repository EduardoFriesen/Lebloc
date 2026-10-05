import { describe, expect, it } from 'vitest';
import { expectDomainError } from '../test/helpers';
import { allocatePayment, type Allocation } from './allocation';
import { SPLIT_RULES, type SplitRule } from './sale';

function payInSequence(splitRule: SplitRule, totalCents: number, surchargeCents: number, amounts: number[]): Allocation[] {
  let allocatedLocalCents = 0;
  let allocatedTeacherCents = 0;
  return amounts.map((amountCents) => {
    const allocation = allocatePayment({ totalCents, surchargeCents, splitRule, allocatedLocalCents, allocatedTeacherCents, amountCents });
    allocatedLocalCents += allocation.localCents;
    allocatedTeacherCents += allocation.teacherCents;
    return allocation;
  });
}

describe('allocatePayment', () => {
  it('proportional: splits by the plan ratio', () => {
    expect(payInSequence('proportional', 3_000_000, 1_000_000, [1_500_000])).toEqual([{ localCents: 1_000_000, teacherCents: 500_000 }]);
  });

  it('proportional: cumulative rounding pays the teacher exactly the surcharge', () => {
    const allocations = payInSequence('proportional', 10_001, 3_333, [1_234, 4_321, 99, 4_347]);
    expect(allocations.reduce((sum, a) => sum + a.teacherCents, 0)).toBe(3_333);
    expect(allocations.reduce((sum, a) => sum + a.localCents, 0)).toBe(6_668);
    for (const allocation of allocations) {
      expect(allocation.teacherCents).toBeGreaterThanOrEqual(0);
      expect(allocation.localCents).toBeGreaterThanOrEqual(0);
    }
  });

  it('proportional: one-cent payments never lose a cent', () => {
    expect(payInSequence('proportional', 3, 1, [1, 1, 1]).map((a) => a.teacherCents)).toEqual([0, 1, 0]);
  });

  it('teacher_first: covers the surcharge before the local share', () => {
    expect(payInSequence('teacher_first', 3_000_000, 1_000_000, [1_500_000, 1_500_000])).toEqual([
      { localCents: 500_000, teacherCents: 1_000_000 },
      { localCents: 1_500_000, teacherCents: 0 },
    ]);
  });

  it('local_first: covers the local share before the surcharge', () => {
    expect(payInSequence('local_first', 3_000_000, 1_000_000, [1_500_000, 1_500_000])).toEqual([
      { localCents: 1_500_000, teacherCents: 0 },
      { localCents: 500_000, teacherCents: 1_000_000 },
    ]);
  });

  it('gives everything to the local when there is no surcharge', () => {
    for (const rule of SPLIT_RULES) {
      expect(payInSequence(rule, 1_000, 0, [400])).toEqual([{ localCents: 400, teacherCents: 0 }]);
    }
  });

  it('rejects payments above the remaining debt', () => {
    expectDomainError(() => payInSequence('proportional', 1_000, 0, [600, 500]), 'PAYMENT_EXCEEDS_DEBT');
  });

  it('rejects zero, negative and fractional amounts', () => {
    for (const amount of [0, -100, 10.5]) {
      expectDomainError(() => payInSequence('proportional', 1_000, 0, [amount]), 'INVALID_AMOUNT');
    }
  });
});
