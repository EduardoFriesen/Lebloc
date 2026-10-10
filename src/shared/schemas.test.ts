import { describe, expect, it } from 'vitest';
import { clientInput, clientListInput, paymentInput, planInput, scheduleInput, settingsInput } from './schemas';

const client = {
  firstName: '  Ana ',
  lastName: 'Roca',
  birthDate: '1990-05-10',
  address: '   ',
  phone: null,
  emergencyName: null,
  emergencyPhone: null,
  emergencyRelation: null,
  enrolledAt: '2026-10-01',
  guardians: [],
};

describe('schemas', () => {
  it('trims names and turns blank optional text into null', () => {
    const parsed = clientInput.parse(client);
    expect(parsed.firstName).toBe('Ana');
    expect(parsed.address).toBeNull();
  });

  it('rejects empty names and malformed dates', () => {
    expect(clientInput.safeParse({ ...client, firstName: ' ' }).success).toBe(false);
    expect(clientInput.safeParse({ ...client, birthDate: '10/05/1990' }).success).toBe(false);
  });

  it('rejects plans without passes, pointing at freePasses', () => {
    const result = planInput.safeParse({ name: 'Vacío', freePasses: 0, teacherPasses: 0, priceCents: 1000, active: true });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['freePasses']);
  });

  it('rejects schedules that end before they start', () => {
    expect(scheduleInput.safeParse({ weekday: 1, startTime: '18:00', endTime: '17:00' }).success).toBe(false);
    expect(scheduleInput.safeParse({ weekday: 1, startTime: '18:00', endTime: '19:30' }).success).toBe(true);
  });

  it('accepts only positive integer cents for payments', () => {
    const base = { saleId: 1, method: 'cash', paidAt: '2026-10-05' };
    expect(paymentInput.safeParse({ ...base, amountCents: 0 }).success).toBe(false);
    expect(paymentInput.safeParse({ ...base, amountCents: 10.5 }).success).toBe(false);
    expect(paymentInput.safeParse({ ...base, amountCents: 100 }).success).toBe(true);
  });

  it('applies list defaults', () => {
    expect(clientListInput.parse({})).toEqual({ search: '', includeArchived: false, onlyDebtors: false });
  });

  it('accepts a waiver validity between 1 and 120 months', () => {
    expect(settingsInput.safeParse({ lowPassesThreshold: 2, waiverValidityMonths: 0 }).success).toBe(false);
    expect(settingsInput.safeParse({ lowPassesThreshold: 2, waiverValidityMonths: 121 }).success).toBe(false);
    expect(settingsInput.safeParse({ lowPassesThreshold: 2, waiverValidityMonths: 12 }).success).toBe(true);
  });
});
