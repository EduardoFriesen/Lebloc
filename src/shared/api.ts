import type { z } from 'zod';
import type { Channel } from './channels';
import * as schemas from './schemas';
import type * as T from './types';

export const apiSchemas = {
  'clients:list': schemas.clientListInput,
  'clients:get': schemas.idInput,
  'clients:create': schemas.clientInput,
  'clients:update': schemas.clientUpdate,
  'clients:archive': schemas.idInput,
  'clients:unarchive': schemas.idInput,
  'clients:anonymize': schemas.idInput,
  'clients:account': schemas.idInput,
  'teachers:list': schemas.activeListInput,
  'teachers:get': schemas.idInput,
  'teachers:create': schemas.teacherInput,
  'teachers:update': schemas.teacherUpdate,
  'teachers:account': schemas.idInput,
  'plans:list': schemas.activeListInput,
  'plans:create': schemas.planInput,
  'plans:update': schemas.planUpdate,
  'sales:create': schemas.saleInput,
  'sales:void': schemas.idInput,
  'payments:create': schemas.paymentInput,
  'payments:void': schemas.idInput,
  'consumptions:create': schemas.consumptionInput,
  'consumptions:void': schemas.idInput,
  'payouts:create': schemas.payoutInput,
  'payouts:void': schemas.idInput,
  'debtors:list': schemas.emptyInput,
  'dashboard:get': schemas.emptyInput,
  'waivers:create': schemas.waiverInput,
  'waivers:void': schemas.idInput,
  'settings:get': schemas.emptyInput,
  'settings:update': schemas.settingsInput,
  'backup:export': schemas.emptyInput,
  'backup:restore': schemas.emptyInput,
} satisfies Record<Channel, z.ZodType>;

export interface ApiOutputs {
  'clients:list': T.ClientSummary[];
  'clients:get': T.Client;
  'clients:create': T.Client;
  'clients:update': T.Client;
  'clients:archive': T.Client;
  'clients:unarchive': T.Client;
  'clients:anonymize': T.Client;
  'clients:account': T.ClientAccount;
  'teachers:list': T.Teacher[];
  'teachers:get': T.Teacher;
  'teachers:create': T.Teacher;
  'teachers:update': T.Teacher;
  'teachers:account': T.TeacherAccount;
  'plans:list': T.Plan[];
  'plans:create': T.Plan;
  'plans:update': T.Plan;
  'sales:create': T.Sale;
  'sales:void': T.Sale;
  'payments:create': T.Payment;
  'payments:void': T.Payment;
  'consumptions:create': T.Consumption;
  'consumptions:void': T.Consumption;
  'payouts:create': T.TeacherPayout;
  'payouts:void': T.TeacherPayout;
  'debtors:list': T.Debtor[];
  'dashboard:get': T.Dashboard;
  'waivers:create': T.WaiverSignature;
  'waivers:void': T.WaiverSignature;
  'settings:get': T.Settings;
  'settings:update': T.Settings;
  'backup:export': T.BackupOutcome;
  'backup:restore': T.BackupOutcome;
}

export type ApiInput<C extends Channel> = z.input<(typeof apiSchemas)[C]>;
export type ApiParsedInput<C extends Channel> = z.output<(typeof apiSchemas)[C]>;

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export type ApiResult<TData> = { success: true; data: TData } | { success: false; error: ApiError };

export interface LeblocBridge {
  invoke<C extends Channel>(channel: C, input: ApiInput<C>): Promise<ApiResult<ApiOutputs[C]>>;
}
