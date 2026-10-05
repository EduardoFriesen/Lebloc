import { beforeEach, describe, expect, it } from 'vitest';
import { expectDomainError, must } from '../../test/helpers';
import { adultClient, basicTeacher, createTestContext, mixedPlan, type TestContext } from '../test-context';
import { createClient } from './clients';
import { voidPayment } from './payments';
import { getTeacherAccount, registerPayout, voidPayout } from './payouts';
import { createPlan } from './plans';
import { sellPlan } from './sales';
import { createTeacher } from './teachers';

describe('teacher ledger', () => {
  let ctx: TestContext;
  let teacherId: number;
  let saleId: number;

  beforeEach(() => {
    ctx = createTestContext();
    const clientId = createClient(ctx, adultClient).id;
    teacherId = createTeacher(ctx, basicTeacher).id;
    const planId = createPlan(ctx, mixedPlan).id;
    saleId = sellPlan(ctx, {
      clientId,
      planId,
      teacherId,
      splitRule: 'proportional',
      soldAt: '2026-10-05',
      initialPayment: { amountCents: 1_500_000, method: 'cash', paidAt: '2026-10-05' },
    }).id;
  });

  const payout = (amountCents: number) =>
    registerPayout(ctx, { teacherId, amountCents, method: 'transfer', paidAt: '2026-10-05', note: null });

  it('earns the teacher share of each collected payment', () => {
    const account = getTeacherAccount(ctx, teacherId);
    expect(account).toMatchObject({ teacherName: 'Juan Pared', earnedCents: 500_000, paidOutCents: 0, balanceCents: 500_000 });
    expect(account.shares).toEqual([
      {
        paymentId: expect.any(Number),
        saleId,
        paidAt: '2026-10-05',
        clientName: 'Ana Roca',
        planName: 'Pack 4+4',
        teacherCents: 500_000,
      },
    ]);
  });

  it('registers payouts up to the balance and voids them once', () => {
    const first = payout(300_000);
    expect(getTeacherAccount(ctx, teacherId).balanceCents).toBe(200_000);
    expectDomainError(() => payout(200_001), 'PAYOUT_EXCEEDS_BALANCE');
    expect(voidPayout(ctx, first.id).voidedAt).not.toBeNull();
    expect(getTeacherAccount(ctx, teacherId).balanceCents).toBe(500_000);
    expectDomainError(() => voidPayout(ctx, first.id), 'ALREADY_VOIDED');
  });

  it('goes negative when a paid-out payment is voided and then blocks new payouts', () => {
    payout(500_000);
    const paymentId = must(getTeacherAccount(ctx, teacherId).shares[0]).paymentId;
    voidPayment(ctx, paymentId);
    expect(getTeacherAccount(ctx, teacherId)).toMatchObject({ earnedCents: 0, paidOutCents: 500_000, balanceCents: -500_000 });
    expectDomainError(() => payout(1), 'PAYOUT_EXCEEDS_BALANCE');
  });

  it('fails with NOT_FOUND for unknown teachers', () => {
    expectDomainError(() => getTeacherAccount(ctx, 999), 'NOT_FOUND');
    expectDomainError(
      () => registerPayout(ctx, { teacherId: 999, amountCents: 1, method: 'cash', paidAt: '2026-10-05', note: null }),
      'NOT_FOUND',
    );
  });
});
