import type { BackupOutcome } from '../../shared/types';
import type { Context } from '../context';
import { getClientAccount } from '../services/account';
import { listAuditLog } from '../services/audit';
import { changeBackupMirror, getBackupStatus, type MirrorOps } from '../services/backups';
import {
  anonymizeClient,
  archiveClient,
  createClient,
  getClient,
  listClients,
  unarchiveClient,
  updateClient,
} from '../services/clients';
import { consume, voidConsumption } from '../services/consumptions';
import { getDashboard } from '../services/dashboard';
import {
  createEmployee,
  getPayslip,
  getStaffStats,
  listEmployees,
  listShifts,
  recordShift,
  settleShifts,
  updateEmployee,
  voidShift,
  voidStaffPayout,
} from '../services/employees';
import { createExpense, getExpenseMonth, voidExpense } from '../services/expenses';
import { getFinanceClients, getFinanceSales, getFinanceSummary, getFinanceTeachers, getFinanceTraffic } from '../services/finance';
import { getKioskStats, listKioskSales, sellKiosk, voidKioskSale } from '../services/kiosk';
import { pickImport, runImport } from '../services/legacyImport';
import { registerPayment, voidPayment } from '../services/payments';
import { getTeacherAccount, listTeacherBalances, registerPayout, voidPayout } from '../services/payouts';
import { getDayEntries, getDayMovements } from '../services/counter';
import { getCounterPrices, sellCounter, updateCounterPrices, voidCounterSale } from '../services/counterSales';
import { createProduct, listProducts, listTopProducts, updateProduct } from '../services/products';
import { createPlan, getPlan, getPlanEnrollments, listPlanSales, listPlans, updatePlan } from '../services/plans';
import { sellPlan, voidSale } from '../services/sales';
import { getSettings, updateSettings } from '../services/settings';
import { getClientStats, getPlanStats, getTeacherStats } from '../services/stats';
import { createTeacher, getTeacher, listTeachers, updateTeacher } from '../services/teachers';
import { signWaiver, voidWaiver } from '../services/waivers';
import type { Handlers } from './execute';

/** What only the main process can do: native dialogs and the database file itself. */
export interface BackupOps extends MirrorOps {
  exportBackup(): Promise<BackupOutcome>;
  restoreBackup(): Promise<BackupOutcome>;
  /** The native dialog to choose the spreadsheet to import; null when it is cancelled. */
  pickSpreadsheet(): Promise<string | null>;
}

export function createHandlers(ctx: Context, backup: BackupOps): Handlers {
  return {
    'clients:list': (input) => listClients(ctx, input),
    'clients:get': ({ id }) => getClient(ctx, id),
    'clients:create': (input) => createClient(ctx, input),
    'clients:update': (input) => updateClient(ctx, input),
    'clients:archive': ({ id }) => archiveClient(ctx, id),
    'clients:unarchive': ({ id }) => unarchiveClient(ctx, id),
    'clients:anonymize': ({ id }) => anonymizeClient(ctx, id),
    'clients:account': ({ id }) => getClientAccount(ctx, id),
    'clients:stats': () => getClientStats(ctx),
    'teachers:list': ({ includeInactive }) => listTeachers(ctx, includeInactive),
    'teachers:balances': () => listTeacherBalances(ctx),
    'teachers:get': ({ id }) => getTeacher(ctx, id),
    'teachers:create': (input) => createTeacher(ctx, input),
    'teachers:update': (input) => updateTeacher(ctx, input),
    'teachers:account': ({ id }) => getTeacherAccount(ctx, id),
    'teachers:stats': () => getTeacherStats(ctx),
    'plans:list': ({ includeInactive }) => listPlans(ctx, includeInactive),
    'plans:get': ({ id }) => getPlan(ctx, id),
    'plans:enrollments': ({ id }) => getPlanEnrollments(ctx, id),
    'plans:sales': (input) => listPlanSales(ctx, input),
    'plans:create': (input) => createPlan(ctx, input),
    'plans:update': (input) => updatePlan(ctx, input),
    'plans:stats': () => getPlanStats(ctx),
    'sales:create': (input) => sellPlan(ctx, input),
    'sales:void': ({ id }) => voidSale(ctx, id),
    'payments:create': (input) => registerPayment(ctx, input),
    'payments:void': ({ id }) => voidPayment(ctx, id),
    'consumptions:create': (input) => consume(ctx, input),
    'consumptions:void': ({ id }) => voidConsumption(ctx, id),
    'payouts:create': (input) => registerPayout(ctx, input),
    'payouts:void': ({ id }) => voidPayout(ctx, id),
    'products:list': ({ includeInactive }) => listProducts(ctx, includeInactive),
    'products:create': (input) => createProduct(ctx, input),
    'products:update': (input) => updateProduct(ctx, input),
    'kiosk:sell': (input) => sellKiosk(ctx, input),
    'kiosk:void': ({ id }) => voidKioskSale(ctx, id),
    'kiosk:sales': ({ date }) => listKioskSales(ctx, date),
    'kiosk:top': () => listTopProducts(ctx),
    'kiosk:stats': () => getKioskStats(ctx),
    'counter:today': () => getDayMovements(ctx),
    'counter:entries': () => getDayEntries(ctx),
    'counter:sell': (input) => sellCounter(ctx, input),
    'counter:void': ({ id }) => voidCounterSale(ctx, id),
    'expenses:month': ({ month }) => getExpenseMonth(ctx, month),
    'expenses:create': (input) => createExpense(ctx, input),
    'expenses:void': ({ id }) => voidExpense(ctx, id),
    'employees:list': ({ includeInactive, month }) => listEmployees(ctx, includeInactive, month),
    'employees:create': (input) => createEmployee(ctx, input),
    'employees:update': (input) => updateEmployee(ctx, input),
    'employees:payslip': (input) => getPayslip(ctx, input),
    'employees:settle': (input) => settleShifts(ctx, input),
    'employees:voidPayout': ({ id }) => voidStaffPayout(ctx, id),
    'shifts:month': ({ month, employeeId }) => listShifts(ctx, month, employeeId ?? null),
    'shifts:create': (input) => recordShift(ctx, input),
    'shifts:void': ({ id }) => voidShift(ctx, id),
    'staff:stats': ({ month }) => getStaffStats(ctx, month),
    'finance:summary': (input) => getFinanceSummary(ctx, input),
    'finance:sales': (range) => getFinanceSales(ctx, range),
    'finance:traffic': (range) => getFinanceTraffic(ctx, range),
    'finance:teachers': (range) => getFinanceTeachers(ctx, range),
    'finance:clients': (range) => getFinanceClients(ctx, range),
    'prices:get': () => getCounterPrices(ctx),
    'prices:update': (input) => updateCounterPrices(ctx, input),
    'dashboard:get': () => getDashboard(ctx),
    'waivers:create': (input) => signWaiver(ctx, input),
    'waivers:void': ({ id }) => voidWaiver(ctx, id),
    'settings:get': () => getSettings(ctx),
    'settings:update': (input) => updateSettings(ctx, input),
    'backup:export': () => backup.exportBackup(),
    'backup:restore': () => backup.restoreBackup(),
    'backup:status': () => getBackupStatus(ctx),
    'backup:mirror': ({ action }) => changeBackupMirror(ctx, action, backup),
    'audit:list': () => listAuditLog(ctx),
    'import:pick': () => pickImport(ctx, backup),
    'import:run': () => runImport(ctx, backup),
  };
}
