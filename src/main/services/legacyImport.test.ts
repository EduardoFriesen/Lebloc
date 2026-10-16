import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectDomainError } from '../../test/helpers';
import { adultClient, basicTeacher, createTestContext, freePlan, type TestContext } from '../test-context';
import { getClientAccount } from './account';
import { listAuditLog } from './audit';
import { createClient, listClients } from './clients';
import { previewImport, runImport } from './legacyImport';
import { listTeacherBalances } from './payouts';
import { createPlan, listPlans } from './plans';
import { createTeacher, listTeachers } from './teachers';

const FIXTURE = join(__dirname, '..', 'import', 'fixtures', 'planilla-ejemplo.xlsx');

describe('legacy spreadsheet import', () => {
  let ctx: TestContext;
  const ops = { backupNow: vi.fn(async () => '/backups/antes.db') };

  beforeEach(() => {
    ctx = createTestContext();
    ops.backupNow.mockClear();
  });

  const clientsByName = () =>
    new Map(
      listClients(ctx, { search: '', includeArchived: true, onlyDebtors: false, onlyWithPasses: false, onlyPendingWaiver: false }).map((client) => [
        `${client.firstName} ${client.lastName}`.trim(),
        client,
      ]),
    );

  it('previews what the spreadsheet holds without writing anything', () => {
    const preview = previewImport(ctx, FIXTURE);
    expect(preview).toMatchObject({
      file: 'planilla-ejemplo.xlsx',
      clients: 9,
      fromPases: 7,
      fromSchool: 2,
      teachers: 3,
      passes: 7,
      debtors: 3,
      debtCents: 2_000_000 + 8_500_000 + 3_000_000,
    });
    expect(preview.warnings.length).toBeGreaterThan(0);
    expect(clientsByName().size).toBe(0);
  });

  it('backs up, then imports clients with their DNI, notes, waiver, current pass, payments and attendance', async () => {
    previewImport(ctx, FIXTURE);
    const result = await runImport(ctx, ops);
    expect(ops.backupNow).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ clients: 9, passes: 7, debtors: 3 });

    const clients = clientsByName();
    expect(clients.size).toBe(9);
    const ana = getClientAccount(ctx, clients.get('Ana Roca')?.id ?? 0);
    expect(ana.client).toMatchObject({ dni: '30111222', notes: 'Viene los martes', birthDate: null, enrolledAt: '2026-01-10' });
    expect(ana.waiver.signedAt).toBe('2026-01-10');
    expect(ana.sales).toMatchObject([{ planName: 'Libre x8', soldAt: '2026-01-12', totalCents: 5_100_000, remainingFree: 5, debtCents: 0 }]);
    expect(ana.payments).toMatchObject([{ paidAt: '2026-01-10', amountCents: 5_100_000, method: 'transfer' }]);
    expect(ana.consumptions).toHaveLength(3);
    expect(ana.consumptions[0]).toMatchObject({ kind: 'free', note: 'Asistencia previa (planilla)' });
    expect(ana.consumptions[0]?.consumedAt).toBe(new Date(2026, 0, 12, 12).toISOString());

    const bruno = getClientAccount(ctx, clients.get('Bruno Sierra')?.id ?? 0);
    expect(bruno.sales).toMatchObject([
      { planName: 'Con profe x4', teacherName: 'Fran', localPriceCents: 4_300_000, teacherSurchargeCents: 2_700_000, remainingTeacher: 2, debtCents: 2_000_000 },
    ]);
    expect(getClientAccount(ctx, clients.get('Carla Méndez')?.id ?? 0).sales).toEqual([]);
    expect(getClientAccount(ctx, clients.get('Toto')?.id ?? 0).client.lastName).toBe('');
  });

  it('creates the plans and the teachers by name, and starts every teacher balance at zero', async () => {
    previewImport(ctx, FIXTURE);
    await runImport(ctx, ops);
    expect(listPlans(ctx, true).map((plan) => plan.name)).toEqual(
      expect.arrayContaining(['Libre x8', 'Con profe x4', 'Día libre', 'Con profe x8', 'Libre x4', 'Escuelita x4', 'Escuelita día']),
    );
    expect(listTeachers(ctx, true).map((teacher) => [teacher.firstName, teacher.lastName, teacher.active, teacher.classRateCents])).toEqual(
      expect.arrayContaining([
        ['Fran', '', true, 0],
        ['Pipi', '', true, 0],
        ['Sin asignar', '', false, 0],
      ]),
    );
    const balances = listTeacherBalances(ctx);
    expect(balances.map((balance) => balance.balanceCents)).toEqual(balances.map(() => 0));
    expect(balances.find((balance) => balance.teacherName.trim() === 'Fran')).toMatchObject({ pendingClasses: 2 });
  });

  it('reuses a plan and a teacher that already exist with the same name', async () => {
    createPlan(ctx, { ...freePlan, name: 'Libre x8' });
    createTeacher(ctx, { ...basicTeacher, firstName: 'Fran', lastName: '' });
    previewImport(ctx, FIXTURE);
    await runImport(ctx, ops);
    expect(listPlans(ctx, true).filter((plan) => plan.name === 'Libre x8')).toHaveLength(1);
    expect(listTeachers(ctx, true).filter((teacher) => teacher.firstName === 'Fran')).toHaveLength(1);
  });

  it('leaves a trace in the audit log', async () => {
    previewImport(ctx, FIXTURE);
    await runImport(ctx, ops);
    expect(listAuditLog(ctx)).toMatchObject([{ action: 'data_imported', detail: '9 clientes y 7 pases de planilla-ejemplo.xlsx' }]);
  });

  it('only imports into a database without clients, before backing up', async () => {
    createClient(ctx, adultClient);
    previewImport(ctx, FIXTURE);
    await expect(runImport(ctx, ops)).rejects.toMatchObject({ code: 'IMPORT_NOT_EMPTY' });
    expect(ops.backupNow).not.toHaveBeenCalled();
    expect(clientsByName().size).toBe(1);
  });

  it('needs a preview first, and imports it only once', async () => {
    await expect(runImport(ctx, ops)).rejects.toMatchObject({ code: 'NO_PENDING_IMPORT' });
    previewImport(ctx, FIXTURE);
    await runImport(ctx, ops);
    await expect(runImport(ctx, ops)).rejects.toMatchObject({ code: 'NO_PENDING_IMPORT' });
  });

  it('rejects a file that is not a spreadsheet', () => {
    expectDomainError(() => previewImport(ctx, __filename), 'INVALID_SPREADSHEET');
  });
});
