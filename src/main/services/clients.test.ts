import { beforeEach, describe, expect, it } from 'vitest';
import { expectDomainError } from '../../test/helpers';
import { adultClient, createTestContext, freePlan, minorClient, TEST_NOW, type TestContext } from '../test-context';
import {
  anonymizeClient,
  archiveClient,
  createClient,
  getClient,
  listClients,
  listRenewals,
  listUsualAttendees,
  unarchiveClient,
  updateClient,
} from './clients';
import { consume, voidConsumption } from './consumptions';
import { registerPayment } from './payments';
import { createPlan } from './plans';
import { sellPlan } from './sales';

describe('clients service', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  it('creates an adult without guardians and stamps updatedAt', () => {
    const client = createClient(ctx, adultClient);
    expect(client.id).toBeGreaterThan(0);
    expect(client.firstName).toBe('Ana');
    expect(client.guardians).toEqual([]);
    expect(client.updatedAt).toBe(TEST_NOW.toISOString());
  });

  it('creates a minor with guardians', () => {
    const client = createClient(ctx, minorClient);
    expect(client.guardians).toHaveLength(1);
    expect(client.guardians[0]?.relation).toBe('Madre');
  });

  it('rejects a minor without guardians on create', () => {
    expectDomainError(() => createClient(ctx, { ...minorClient, guardians: [] }), 'MINOR_REQUIRES_GUARDIAN');
  });

  it('rejects removing every guardian from a minor on update', () => {
    const client = createClient(ctx, minorClient);
    expectDomainError(() => updateClient(ctx, { ...minorClient, id: client.id, guardians: [] }), 'MINOR_REQUIRES_GUARDIAN');
    expect(getClient(ctx, client.id).guardians).toHaveLength(1);
  });

  it('updates fields, replaces guardians and stamps updatedAt', () => {
    const client = createClient(ctx, minorClient);
    const later = new Date(2026, 9, 6, 9, 0, 0);
    ctx.clock.set(later);
    const updated = updateClient(ctx, {
      ...minorClient,
      id: client.id,
      phone: '1166660000',
      guardians: [{ firstName: 'Pablo', lastName: 'Roca', dni: null, phone: null, relation: 'Padre' }],
    });
    expect(updated.phone).toBe('1166660000');
    expect(updated.guardians.map((g) => g.firstName)).toEqual(['Pablo']);
    expect(updated.updatedAt).toBe(later.toISOString());
  });

  it('searches by name in either order and hides archived clients by default', () => {
    const ana = createClient(ctx, adultClient);
    createClient(ctx, { ...adultClient, firstName: 'Bruno', lastName: 'Sierra' });
    expect(listClients(ctx, { search: 'roca', includeArchived: false, onlyDebtors: false, onlyWithPasses: false }).map((c) => c.id)).toEqual([ana.id]);
    expect(listClients(ctx, { search: 'Roca Ana', includeArchived: false, onlyDebtors: false, onlyWithPasses: false }).map((c) => c.id)).toEqual([ana.id]);
    archiveClient(ctx, ana.id);
    expect(listClients(ctx, { search: '', includeArchived: false, onlyDebtors: false, onlyWithPasses: false }).map((c) => c.lastName)).toEqual(['Sierra']);
    expect(listClients(ctx, { search: '', includeArchived: true, onlyDebtors: false, onlyWithPasses: false })).toHaveLength(2);
  });

  it('treats LIKE wildcards in the search as plain text', () => {
    createClient(ctx, adultClient);
    expect(listClients(ctx, { search: '%', includeArchived: false, onlyDebtors: false, onlyWithPasses: false })).toEqual([]);
  });

  it('summarizes a client without sales as zero passes and zero debt', () => {
    createClient(ctx, adultClient);
    expect(listClients(ctx, { search: '', includeArchived: false, onlyDebtors: false, onlyWithPasses: false })[0]).toMatchObject({
      activeSales: 0,
      remainingFree: 0,
      remainingTeacher: 0,
      debtCents: 0,
      passStatus: 'none',
    });
  });

  it('lists only debtors on request, oldest unpaid sale first, with days since that sale', () => {
    const planId = createPlan(ctx, freePlan).id;
    const sell = (clientId: number, soldAt: string) =>
      sellPlan(ctx, { clientId, planId, teacherId: null, splitRule: 'proportional', soldAt, initialPayment: null });
    const payInFull = (sale: { id: number; totalCents: number }) =>
      registerPayment(ctx, { saleId: sale.id, amountCents: sale.totalCents, method: 'cash', paidAt: '2026-09-01' });
    const ana = createClient(ctx, adultClient).id;
    const bruno = createClient(ctx, { ...adultClient, firstName: 'Bruno', lastName: 'Sierra' }).id;
    const carla = createClient(ctx, { ...adultClient, firstName: 'Carla', lastName: 'Albo' }).id;
    payInFull(sell(ana, '2026-09-01'));
    sell(ana, '2026-10-01');
    sell(bruno, '2026-09-20');
    payInFull(sell(carla, '2026-08-15'));

    const debtors = listClients(ctx, { search: '', includeArchived: false, onlyDebtors: true, onlyWithPasses: false });
    expect(debtors.map((client) => [client.firstName, client.debtDays])).toEqual([
      ['Bruno', 15],
      ['Ana', 4],
    ]);
    const everyone = listClients(ctx, { search: '', includeArchived: false, onlyDebtors: false, onlyWithPasses: false });
    expect(everyone.find((client) => client.id === carla)?.debtDays).toBeNull();
  });

  it('lists only clients with passes left on request', () => {
    const planId = createPlan(ctx, { ...freePlan, name: 'Pase suelto', freePasses: 1 }).id;
    const sell = (clientId: number) =>
      sellPlan(ctx, { clientId, planId, teacherId: null, splitRule: 'proportional', soldAt: '2026-10-01', initialPayment: null });
    const ana = createClient(ctx, adultClient).id;
    const bruno = createClient(ctx, { ...adultClient, firstName: 'Bruno', lastName: 'Sierra' }).id;
    createClient(ctx, { ...adultClient, firstName: 'Carla', lastName: 'Albo' });
    sell(ana);
    sell(bruno);
    consume(ctx, { clientId: bruno, kind: 'free', note: null });

    const withPasses = listClients(ctx, { search: '', includeArchived: false, onlyDebtors: false, onlyWithPasses: true });
    expect(withPasses.map((client) => client.firstName)).toEqual(['Ana']);
  });

  it('blocks edits on archived clients and allows unarchiving', () => {
    const client = createClient(ctx, adultClient);
    archiveClient(ctx, client.id);
    expectDomainError(() => updateClient(ctx, { ...adultClient, id: client.id }), 'CLIENT_ARCHIVED');
    expect(unarchiveClient(ctx, client.id).archivedAt).toBeNull();
  });

  it('anonymizes only archived clients, wiping personal data and guardians', () => {
    const client = createClient(ctx, minorClient);
    expectDomainError(() => anonymizeClient(ctx, client.id), 'CLIENT_NOT_ARCHIVED');
    archiveClient(ctx, client.id);
    const anonymized = anonymizeClient(ctx, client.id);
    expect(anonymized).toMatchObject({
      firstName: 'Cliente',
      lastName: `anonimizado #${client.id}`,
      birthDate: null,
      phone: null,
      emergencyName: null,
      guardians: [],
    });
    expect(anonymized.anonymizedAt).toBe(TEST_NOW.toISOString());
    expectDomainError(() => unarchiveClient(ctx, client.id), 'CLIENT_ANONYMIZED');
  });

  it('fails with NOT_FOUND for unknown clients', () => {
    expectDomainError(() => getClient(ctx, 999), 'NOT_FOUND');
  });

  describe('counter lists', () => {
    // TEST_NOW is Monday 5/10/2026 12:00 local time.
    function clientWith(firstName: string, passes: number): number {
      const planId = createPlan(ctx, { name: `Pack ${passes}`, freePasses: passes, teacherPasses: 0, priceCents: 0, active: true }).id;
      const clientId = createClient(ctx, { ...adultClient, firstName, lastName: 'Test' }).id;
      sellPlan(ctx, { clientId, planId, teacherId: null, splitRule: 'proportional', soldAt: '2026-08-01', initialPayment: null });
      return clientId;
    }

    function climbAt(clientId: number, when: Date) {
      ctx.clock.set(when);
      const consumption = consume(ctx, { clientId, kind: 'free', note: null });
      ctx.clock.set(TEST_NOW);
      return consumption;
    }

    it('preloads who came last week within an hour of now, minus who came today, voided and archived', () => {
      climbAt(clientWith('Ana', 8), new Date(2026, 8, 28, 11, 10));
      climbAt(clientWith('Bruno', 8), new Date(2026, 8, 28, 9, 59));
      const carla = clientWith('Carla', 8);
      climbAt(carla, new Date(2026, 8, 28, 12, 30));
      climbAt(carla, new Date(2026, 9, 5, 9, 0));
      const dario = clientWith('Dario', 8);
      voidConsumption(ctx, climbAt(dario, new Date(2026, 8, 28, 12, 0)).id);
      const eva = clientWith('Eva', 8);
      climbAt(eva, new Date(2026, 8, 28, 12, 50));
      archiveClient(ctx, eva);

      expect(listUsualAttendees(ctx).map((client) => client.firstName)).toEqual(['Ana']);
    });

    it('lists who has to renew: low or no passes and came in the last 30 days, no passes first', () => {
      const luis = clientWith('Luis', 3);
      climbAt(luis, new Date(2026, 8, 25, 18, 0));
      climbAt(luis, new Date(2026, 8, 25, 19, 0));
      const mara = clientWith('Mara', 1);
      climbAt(mara, new Date(2026, 8, 30, 18, 0));
      climbAt(clientWith('Nora', 8), new Date(2026, 9, 2, 18, 0));
      const omar = clientWith('Omar', 3);
      climbAt(omar, new Date(2026, 7, 20, 18, 0));
      climbAt(omar, new Date(2026, 7, 21, 18, 0));

      expect(listRenewals(ctx).map((client) => [client.firstName, client.passStatus])).toEqual([
        ['Mara', 'none'],
        ['Luis', 'low'],
      ]);
    });
  });
});
