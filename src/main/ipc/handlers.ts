import type { BackupOutcome } from '../../shared/types';
import type { Context } from '../context';
import { getClientAccount } from '../services/account';
import {
  anonymizeClient,
  archiveClient,
  createClient,
  getClient,
  listClients,
  listUsualAttendees,
  unarchiveClient,
  updateClient,
} from '../services/clients';
import { consume, voidConsumption } from '../services/consumptions';
import { getDashboard } from '../services/dashboard';
import { registerPayment, voidPayment } from '../services/payments';
import { getTeacherAccount, listTeacherBalances, registerPayout, voidPayout } from '../services/payouts';
import { createPlan, getPlan, getPlanEnrollments, listPlans, updatePlan } from '../services/plans';
import { sellPlan, voidSale } from '../services/sales';
import { getSettings, updateSettings } from '../services/settings';
import { createTeacher, getTeacher, listTeachers, updateTeacher } from '../services/teachers';
import { signWaiver, voidWaiver } from '../services/waivers';
import type { Handlers } from './execute';

export interface BackupOps {
  exportBackup(): Promise<BackupOutcome>;
  restoreBackup(): Promise<BackupOutcome>;
}

export function createHandlers(ctx: Context, backup: BackupOps): Handlers {
  return {
    'clients:list': (input) => listClients(ctx, input),
    'counter:usual': () => listUsualAttendees(ctx),
    'clients:get': ({ id }) => getClient(ctx, id),
    'clients:create': (input) => createClient(ctx, input),
    'clients:update': (input) => updateClient(ctx, input),
    'clients:archive': ({ id }) => archiveClient(ctx, id),
    'clients:unarchive': ({ id }) => unarchiveClient(ctx, id),
    'clients:anonymize': ({ id }) => anonymizeClient(ctx, id),
    'clients:account': ({ id }) => getClientAccount(ctx, id),
    'teachers:list': ({ includeInactive }) => listTeachers(ctx, includeInactive),
    'teachers:balances': () => listTeacherBalances(ctx),
    'teachers:get': ({ id }) => getTeacher(ctx, id),
    'teachers:create': (input) => createTeacher(ctx, input),
    'teachers:update': (input) => updateTeacher(ctx, input),
    'teachers:account': ({ id }) => getTeacherAccount(ctx, id),
    'plans:list': ({ includeInactive }) => listPlans(ctx, includeInactive),
    'plans:get': ({ id }) => getPlan(ctx, id),
    'plans:enrollments': ({ id }) => getPlanEnrollments(ctx, id),
    'plans:create': (input) => createPlan(ctx, input),
    'plans:update': (input) => updatePlan(ctx, input),
    'sales:create': (input) => sellPlan(ctx, input),
    'sales:void': ({ id }) => voidSale(ctx, id),
    'payments:create': (input) => registerPayment(ctx, input),
    'payments:void': ({ id }) => voidPayment(ctx, id),
    'consumptions:create': (input) => consume(ctx, input),
    'consumptions:void': ({ id }) => voidConsumption(ctx, id),
    'payouts:create': (input) => registerPayout(ctx, input),
    'payouts:void': ({ id }) => voidPayout(ctx, id),
    'dashboard:get': () => getDashboard(ctx),
    'waivers:create': (input) => signWaiver(ctx, input),
    'waivers:void': ({ id }) => voidWaiver(ctx, id),
    'settings:get': () => getSettings(ctx),
    'settings:update': (input) => updateSettings(ctx, input),
    'backup:export': () => backup.exportBackup(),
    'backup:restore': () => backup.restoreBackup(),
  };
}
