import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseIsoDate } from '../../domain/dates';
import { DomainError } from '../../domain/errors';
import { buildImportPlan, type ImportPlan, type ImportSummary, type LegacyPlan, summarizeImport } from '../../domain/legacyImport';
import { fold } from '../../shared/text';
import type { ImportPick, ImportPreview } from '../../shared/types';
import { type Context, nowIso, today } from '../context';
import type { Db } from '../db/connection';
import { readWorkbook } from '../import/xlsx';
import { insertAudit } from '../repos/audit';
import { countClients, insertClient } from '../repos/clients';
import { insertConsumption } from '../repos/consumptions';
import { insertPlan } from '../repos/plans';
import { insertSale } from '../repos/sales';
import { insertTeacher } from '../repos/teachers';
import { registerPayment } from './payments';
import { listTeacherBalances, registerPayout } from './payouts';
import { listPlans } from './plans';
import { listTeachers } from './teachers';
import { signWaiver } from './waivers';

/** Passes that started this year come in as current; older ones stay in the spreadsheet (decided with the local). */
const IMPORT_SINCE = '2026-01-01';
const ATTENDANCE_NOTE = 'Asistencia previa (planilla)';
const OPENING_PAYOUT_NOTE = 'Saldo al migrar';

// ponytail: the previewed spreadsheet waits in memory, one per database connection (a restore drops it), since
// there is a single window at a single counter PC.
const pending = new WeakMap<Db, { plan: ImportPlan; file: string }>();

export function previewImport(ctx: Context, file: string): ImportPreview {
  const plan = buildImportPlan(readWorkbook(readFileSync(file)), today(ctx), IMPORT_SINCE);
  pending.set(ctx.db, { plan, file: basename(file) });
  return { file: basename(file), ...summarizeImport(plan) };
}

/** Opens the native file dialog (the path never comes from the page) and previews the chosen spreadsheet. */
export async function pickImport(ctx: Context, ops: { pickSpreadsheet(): Promise<string | null> }): Promise<ImportPick> {
  const file = await ops.pickSpreadsheet();
  return file ? { status: 'ready', preview: previewImport(ctx, file) } : { status: 'cancelled' };
}

/** Attendance before the import: noon of the day the pass started, local time. */
function attendanceTime(startedAt: string): string {
  const [year, month, day] = parseIsoDate(startedAt);
  return new Date(year, month - 1, day, 12).toISOString();
}

function applyImport(ctx: Context, plan: ImportPlan, file: string): void {
  const now = nowIso(ctx);
  const existingPlans = new Map(listPlans(ctx, true).map((p) => [fold(p.name), p.id]));
  const planIds = new Map<string, number>();
  const specs = new Map<string, LegacyPlan>();
  for (const legacy of plan.plans) {
    specs.set(legacy.key, legacy);
    const { name, freePasses, teacherPasses, priceCents, surchargeCents: teacherAmountCents } = legacy;
    const fields = { name, freePasses, teacherPasses, priceCents, teacherAmountCents, active: true };
    planIds.set(legacy.key, existingPlans.get(fold(name)) ?? insertPlan(ctx.db, fields));
  }

  const existingTeachers = new Map(listTeachers(ctx, true).map((t) => [fold(`${t.firstName} ${t.lastName}`.trim()), t.id]));
  const teacherIds = new Map<string, number>();
  for (const { name, active } of plan.teachers) {
    // Only the name: phone and schedules are filled in from Profesores.
    const id = existingTeachers.get(fold(name)) ?? insertTeacher(ctx.db, { firstName: name, lastName: '', address: null, phone: null, socials: [], active });
    teacherIds.set(name, id);
  }

  for (const client of plan.clients) {
    const { firstName, lastName, dni, notes, enrolledAt, waiverSignedAt, pass } = client;
    const clientId = insertClient(
      ctx.db,
      { firstName, lastName, dni, notes, enrolledAt, birthDate: null, address: null, phone: null, emergencyName: null, emergencyPhone: null, emergencyRelation: null },
      now,
    );
    if (waiverSignedAt) signWaiver(ctx, { clientId, signedAt: waiverSignedAt });
    if (!pass) continue;
    const spec = specs.get(pass.planKey);
    const planId = planIds.get(pass.planKey);
    if (!spec || !planId) throw new Error(`Plan ${pass.planKey} missing from the import plan`);
    // The teacher's part comes from the spreadsheet's table; a typed price keeps it.
    const surchargeCents = Math.min(spec.surchargeCents, pass.totalCents);
    const saleId = insertSale(ctx.db, clientId, pass.startedAt, {
      planId,
      planName: spec.name,
      freePasses: spec.freePasses,
      teacherPasses: spec.teacherPasses,
      localPriceCents: pass.totalCents - surchargeCents,
      teacherId: pass.teacher ? (teacherIds.get(pass.teacher) ?? null) : null,
      teacherSurchargeCents: surchargeCents,
      totalCents: pass.totalCents,
      splitRule: 'proportional',
    });
    for (const payment of pass.payments) registerPayment(ctx, { saleId, ...payment });
    const kind = spec.teacherPasses > 0 ? 'teacher' : 'free';
    for (let index = 0; index < pass.used; index += 1) {
      insertConsumption(ctx.db, { saleId, kind, consumedAt: attendanceTime(pass.startedAt), note: ATTENDANCE_NOTE });
    }
  }

  // The local already pays its teachers week by week: what the imported payments say they're owed starts settled.
  for (const balance of listTeacherBalances(ctx)) {
    if (balance.balanceCents > 0) {
      registerPayout(ctx, { teacherId: balance.teacherId, amountCents: balance.balanceCents, method: 'cash', paidAt: today(ctx), note: OPENING_PAYOUT_NOTE });
    }
  }
  const passes = plan.clients.filter((client) => client.pass).length;
  insertAudit(ctx.db, { at: now, action: 'data_imported', subjectId: null, detail: `${plan.clients.length} clientes y ${passes} pases de ${file}` });
}

/** Imports the previewed spreadsheet into a database without clients, after a backup. */
export async function runImport(ctx: Context, ops: { backupNow(): Promise<string> }): Promise<ImportSummary> {
  const previewed = pending.get(ctx.db);
  if (!previewed) throw new DomainError('NO_PENDING_IMPORT');
  if (countClients(ctx.db) > 0) throw new DomainError('IMPORT_NOT_EMPTY');
  await ops.backupNow();
  ctx.db.transaction(() => applyImport(ctx, previewed.plan, previewed.file))();
  pending.delete(ctx.db);
  return summarizeImport(previewed.plan);
}
