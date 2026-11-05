import { DomainError } from './errors';
import type { SplitRule } from './sale';

export interface AllocationInput {
  totalCents: number;
  surchargeCents: number;
  splitRule: SplitRule;
  allocatedLocalCents: number;
  allocatedTeacherCents: number;
  amountCents: number;
}

export interface Allocation {
  localCents: number;
  teacherCents: number;
}

export function allocatePayment(input: AllocationInput): Allocation {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new DomainError('INVALID_AMOUNT');
  const paidBefore = input.allocatedLocalCents + input.allocatedTeacherCents;
  if (input.amountCents > input.totalCents - paidBefore) throw new DomainError('PAYMENT_EXCEEDS_DEBT');

  // After a sale is extended, its earlier payments keep their split, so a rule can ask for more than a part has
  // left (or more than the payment): the teacher share stays within what each part still owes.
  const localPending = input.totalCents - input.surchargeCents - input.allocatedLocalCents;
  const teacherPending = input.surchargeCents - input.allocatedTeacherCents;
  const teacherCents = Math.min(Math.max(teacherShare(input, paidBefore), input.amountCents - localPending, 0), input.amountCents, teacherPending);
  return { localCents: input.amountCents - teacherCents, teacherCents };
}

function teacherShare(input: AllocationInput, paidBefore: number): number {
  switch (input.splitRule) {
    case 'teacher_first':
      return Math.min(input.amountCents, input.surchargeCents - input.allocatedTeacherCents);
    case 'local_first': {
      const localPending = input.totalCents - input.surchargeCents - input.allocatedLocalCents;
      return input.amountCents - Math.min(input.amountCents, localPending);
    }
    case 'proportional': {
      if (input.surchargeCents === 0) return 0;
      // Cumulative target so rounding never drifts: once the sale is settled
      // the teacher has received exactly the surcharge.
      const target = Math.round(((paidBefore + input.amountCents) * input.surchargeCents) / input.totalCents);
      return target - input.allocatedTeacherCents;
    }
  }
}
