import type { z } from 'zod';
import type { Channel } from './channels';
import * as schemas from './schemas';
import type * as T from './types';

export const apiSchemas = {
  'clients:list': schemas.clientListInput,
  'counter:usual': schemas.emptyInput,
  'clients:get': schemas.idInput,
  'clients:create': schemas.clientInput,
  'clients:update': schemas.clientUpdate,
  'clients:archive': schemas.idInput,
  'clients:unarchive': schemas.idInput,
  'clients:anonymize': schemas.idInput,
  'clients:account': schemas.idInput,
  'clients:stats': schemas.emptyInput,
  'teachers:list': schemas.activeListInput,
  'teachers:balances': schemas.emptyInput,
  'teachers:get': schemas.idInput,
  'teachers:create': schemas.teacherInput,
  'teachers:update': schemas.teacherUpdate,
  'teachers:account': schemas.idInput,
  'teachers:stats': schemas.emptyInput,
  'plans:list': schemas.activeListInput,
  'plans:get': schemas.idInput,
  'plans:enrollments': schemas.idInput,
  'plans:sales': schemas.planSalesInput,
  'plans:create': schemas.planInput,
  'plans:update': schemas.planUpdate,
  'plans:stats': schemas.emptyInput,
  'sales:create': schemas.saleInput,
  'sales:void': schemas.idInput,
  'payments:create': schemas.paymentInput,
  'payments:void': schemas.idInput,
  'consumptions:create': schemas.consumptionInput,
  'consumptions:void': schemas.idInput,
  'payouts:create': schemas.payoutInput,
  'payouts:void': schemas.idInput,
  'products:list': schemas.activeListInput,
  'products:create': schemas.productInput,
  'products:update': schemas.productUpdate,
  'kiosk:sell': schemas.kioskSellInput,
  'kiosk:void': schemas.idInput,
  'kiosk:sales': schemas.kioskSalesInput,
  'kiosk:top': schemas.emptyInput,
  'kiosk:stats': schemas.emptyInput,
  'counter:today': schemas.emptyInput,
  'counter:entries': schemas.emptyInput,
  'counter:sell': schemas.counterSellInput,
  'counter:void': schemas.idInput,
  'expenses:month': schemas.monthInput,
  'expenses:create': schemas.expenseInput,
  'expenses:void': schemas.idInput,
  'employees:list': schemas.employeeListInput,
  'employees:create': schemas.employeeInput,
  'employees:update': schemas.employeeUpdate,
  'employees:payslip': schemas.payslipInput,
  'shifts:month': schemas.shiftListInput,
  'shifts:create': schemas.shiftInput,
  'shifts:void': schemas.idInput,
  'staff:stats': schemas.monthInput,
  'finance:summary': schemas.financeRangeInput,
  'finance:sales': schemas.financeRangeInput,
  'finance:traffic': schemas.financeRangeInput,
  'finance:teachers': schemas.financeRangeInput,
  'finance:clients': schemas.financeRangeInput,
  'prices:get': schemas.emptyInput,
  'prices:update': schemas.counterPricesInput,
  'dashboard:get': schemas.emptyInput,
  'waivers:create': schemas.waiverInput,
  'waivers:void': schemas.idInput,
  'settings:get': schemas.emptyInput,
  'settings:update': schemas.settingsInput,
  'backup:export': schemas.emptyInput,
  'backup:restore': schemas.emptyInput,
  'backup:status': schemas.emptyInput,
  'backup:mirror': schemas.backupMirrorInput,
  'audit:list': schemas.emptyInput,
} satisfies Record<Channel, z.ZodType>;

export interface ApiOutputs {
  'clients:list': T.ClientSummary[];
  'counter:usual': T.ClientSummary[];
  'clients:get': T.Client;
  'clients:create': T.Client;
  'clients:update': T.Client;
  'clients:archive': T.Client;
  'clients:unarchive': T.Client;
  'clients:anonymize': T.Client;
  'clients:account': T.ClientAccount;
  'clients:stats': T.ClientStats;
  'teachers:list': T.Teacher[];
  'teachers:balances': T.TeacherBalance[];
  'teachers:get': T.Teacher;
  'teachers:create': T.Teacher;
  'teachers:update': T.Teacher;
  'teachers:account': T.TeacherAccount;
  'teachers:stats': T.TeacherStats;
  'plans:list': T.Plan[];
  'plans:get': T.Plan;
  'plans:enrollments': T.Enrollment[];
  'plans:sales': T.PlanSale[];
  'plans:create': T.Plan;
  'plans:update': T.Plan;
  'plans:stats': T.PlanStats;
  'sales:create': T.Sale;
  'sales:void': T.Sale;
  'payments:create': T.Payment;
  'payments:void': T.Payment;
  'consumptions:create': T.Consumption;
  'consumptions:void': T.Consumption;
  'payouts:create': T.TeacherPayout;
  'payouts:void': T.TeacherPayout;
  'products:list': T.Product[];
  'products:create': T.Product;
  'products:update': T.Product;
  'kiosk:sell': T.KioskSale;
  'kiosk:void': T.KioskSale;
  'kiosk:sales': T.KioskSale[];
  'kiosk:top': T.Product[];
  'kiosk:stats': T.KioskStats;
  'counter:today': T.DayMovements;
  'counter:entries': T.DayEntry[];
  'counter:sell': T.CounterSale[];
  'counter:void': T.CounterSale;
  'expenses:month': T.ExpenseMonth;
  'expenses:create': T.Expense;
  'expenses:void': T.Expense;
  'employees:list': T.EmployeeSummary[];
  'employees:create': T.Employee;
  'employees:update': T.Employee;
  'employees:payslip': T.Payslip;
  'shifts:month': T.WorkShift[];
  'shifts:create': T.WorkShift;
  'shifts:void': T.WorkShift;
  'staff:stats': T.StaffStats;
  'finance:summary': T.FinanceSummary;
  'finance:sales': T.FinanceSales;
  'finance:traffic': T.FinanceTraffic;
  'finance:teachers': T.TeacherActivity[];
  'finance:clients': T.FinanceClients;
  'prices:get': T.CounterPrices;
  'prices:update': T.CounterPrices;
  'dashboard:get': T.Dashboard;
  'waivers:create': T.WaiverSignature;
  'waivers:void': T.WaiverSignature;
  'settings:get': T.Settings;
  'settings:update': T.Settings;
  'backup:export': T.BackupOutcome;
  'backup:restore': T.BackupOutcome;
  'backup:status': T.BackupStatus;
  'backup:mirror': T.BackupStatus;
  'audit:list': T.AuditEntry[];
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
