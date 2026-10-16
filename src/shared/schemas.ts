import { z } from 'zod';

z.config(z.locales.es());

const MAX_CENTS = 100_000_000_000;
const REQUIRED = 'Obligatorio';

const id = z.number().int().positive();
const isoDate = z.iso.date({ error: 'Fecha inválida' });
const personName = z.string().trim().min(1, REQUIRED).max(80);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null));
const cents = z.number().int().min(0).max(MAX_CENTS);
const positiveCents = z.number().int().positive().max(MAX_CENTS);
const passCount = z.number().int().min(0).max(500);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:MM)');

export const paymentMethodSchema = z.enum(['cash', 'transfer']);
export const splitRuleSchema = z.enum(['proportional', 'teacher_first', 'local_first']);
export const passKindSchema = z.enum(['free', 'teacher']);
export const expenseCategorySchema = z.enum(['rent', 'electricity', 'gas', 'water', 'internet', 'taxes', 'maintenance', 'other']);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes inválido');

export const idInput = z.object({ id });
export const emptyInput = z.object({});
export const activeListInput = z.object({ includeInactive: z.boolean().default(false) });

export const guardianInput = z.object({
  firstName: personName,
  lastName: personName,
  dni: optionalText(20),
  phone: optionalText(30),
  relation: optionalText(40),
});

const clientFields = {
  firstName: personName,
  lastName: personName,
  birthDate: isoDate,
  dni: optionalText(20),
  notes: optionalText(1000),
  address: optionalText(200),
  phone: optionalText(30),
  emergencyName: optionalText(120),
  emergencyPhone: optionalText(30),
  emergencyRelation: optionalText(40),
  enrolledAt: isoDate,
  guardians: z.array(guardianInput).max(4),
};
export const clientInput = z.object(clientFields);
export const clientUpdate = z.object({ id, ...clientFields });
export const clientListInput = z.object({
  search: z.string().trim().max(80).default(''),
  includeArchived: z.boolean().default(false),
  onlyDebtors: z.boolean().default(false),
  onlyWithPasses: z.boolean().default(false),
  onlyPendingWaiver: z.boolean().default(false),
  // Filters picked from the summary beside the client list; optional so other callers can leave them out.
  onlyWithoutPasses: z.boolean().optional(),
  onlyMinors: z.boolean().optional(),
  onlyNewThisMonth: z.boolean().optional(),
  /** Only archived clients; wins over includeArchived. */
  onlyArchived: z.boolean().optional(),
});

export const socialInput = z.object({
  network: z.string().trim().min(1, REQUIRED).max(30),
  handle: z.string().trim().min(1, REQUIRED).max(80),
});
export const scheduleInput = z
  .object({ weekday: z.number().int().min(0).max(6), startTime: hhmm, endTime: hhmm })
  .refine((schedule) => schedule.startTime < schedule.endTime, {
    message: 'La hora de fin tiene que ser posterior al inicio',
    path: ['endTime'],
  });

const teacherFields = {
  firstName: personName,
  lastName: personName,
  address: optionalText(200),
  phone: optionalText(30),
  socials: z.array(socialInput).max(10),
  classRateCents: cents,
  active: z.boolean(),
  schedules: z.array(scheduleInput).max(30),
};
export const teacherInput = z.object(teacherFields);
export const teacherUpdate = z.object({ id, ...teacherFields });

const planFields = {
  name: z.string().trim().min(1, REQUIRED).max(80),
  freePasses: passCount,
  teacherPasses: passCount,
  priceCents: cents,
  active: z.boolean(),
};
const hasPasses = (plan: { freePasses: number; teacherPasses: number }) => plan.freePasses + plan.teacherPasses > 0;
const hasPassesIssue = { message: 'El plan tiene que tener al menos un pase', path: ['freePasses'] };
export const planInput = z.object(planFields).refine(hasPasses, hasPassesIssue);
export const planUpdate = z.object({ id, ...planFields }).refine(hasPasses, hasPassesIssue);

const newPaymentFields = { amountCents: positiveCents, method: paymentMethodSchema, paidAt: isoDate };
export const saleInput = z.object({
  clientId: id,
  planId: id,
  teacherId: id.nullable(),
  splitRule: splitRuleSchema,
  soldAt: isoDate,
  initialPayment: z.object(newPaymentFields).nullable(),
});
export const paymentInput = z.object({ saleId: id, ...newPaymentFields });
export const consumptionInput = z.object({ clientId: id, kind: passKindSchema, note: optionalText(200) });
export const payoutInput = z.object({ teacherId: id, ...newPaymentFields, note: optionalText(200) });
export const settingsInput = z.object({
  lowPassesThreshold: z.number().int().min(0).max(100),
  waiverValidityMonths: z.number().int().min(1).max(120),
});
export const waiverInput = z.object({ clientId: id, signedAt: isoDate });

const productFields = {
  name: z.string().trim().min(1, REQUIRED).max(80),
  packSize: z.number().int().min(1).max(1000),
  packCostCents: cents,
  markupPercent: z.number().int().min(0).max(1000),
  priceCents: cents,
  active: z.boolean(),
};
export const productInput = z.object(productFields);
export const productUpdate = z.object({ id, ...productFields });
export const kioskSellInput = z.object({
  items: z
    .array(z.object({ productId: id, quantity: z.number().int().min(1).max(100) }))
    .min(1, 'Agregá al menos un producto')
    .max(50),
  method: paymentMethodSchema,
});
export const kioskSalesInput = z.object({ date: isoDate });
export const counterPricesInput = z.object({ dayPassCents: cents, shoeRentalCents: cents });
export const counterSellInput = z.object({
  kinds: z
    .array(z.enum(['day_pass', 'shoe_rental']))
    .min(1)
    .max(2)
    .refine((kinds) => new Set(kinds).size === kinds.length, 'Sin repetir'),
  method: paymentMethodSchema,
});
export const monthInput = z.object({ month });

const MAX_RANGE_DAYS = 1096;
const DAY_MS = 86_400_000;
export const financeRangeInput = z
  .object({ from: isoDate, to: isoDate })
  .refine((range) => range.from <= range.to, { message: 'El inicio tiene que ser anterior al fin', path: ['to'] })
  .refine((range) => (Date.parse(range.to) - Date.parse(range.from)) / DAY_MS < MAX_RANGE_DAYS, {
    message: 'El período no puede pasar de 3 años',
    path: ['from'],
  });
export const expenseInput = z.object({
  category: expenseCategorySchema,
  description: optionalText(200),
  amountCents: positiveCents,
  method: paymentMethodSchema,
  paidAt: isoDate,
});

const employeeFields = {
  firstName: personName,
  lastName: personName,
  dni: optionalText(20),
  phone: optionalText(30),
  address: optionalText(200),
  kind: z.enum(['staff', 'casual']),
  hourlyRateCents: cents,
  active: z.boolean(),
};
export const employeeInput = z.object(employeeFields);
export const employeeUpdate = z.object({ id, ...employeeFields });
export const employeeListInput = z.object({ includeInactive: z.boolean().default(false), month });
export const shiftListInput = z.object({ month, employeeId: id.optional() });
export const payslipInput = z
  .object({ employeeId: id, from: isoDate, to: isoDate })
  .refine((range) => range.from <= range.to, { message: 'El inicio tiene que ser anterior al fin', path: ['to'] });
export const planSalesInput = z.object({ month, planId: id.optional() });
export const backupMirrorInput = z.object({ action: z.enum(['choose', 'clear']) });
export const shiftInput = z.object({
  employeeId: id,
  workedOn: isoDate,
  minutes: z.number().int().min(1, 'Cargá al menos un minuto').max(1440, 'Un turno no puede pasar de 24 horas'),
  note: optionalText(200),
});

export type GuardianInput = z.infer<typeof guardianInput>;
export type ClientInput = z.infer<typeof clientInput>;
export type ClientUpdate = z.infer<typeof clientUpdate>;
export type ClientListInput = z.infer<typeof clientListInput>;
export type ScheduleInput = z.infer<typeof scheduleInput>;
export type TeacherInput = z.infer<typeof teacherInput>;
export type TeacherUpdate = z.infer<typeof teacherUpdate>;
export type PlanInput = z.infer<typeof planInput>;
export type PlanUpdate = z.infer<typeof planUpdate>;
export type SaleInput = z.infer<typeof saleInput>;
export type PaymentInput = z.infer<typeof paymentInput>;
export type ConsumptionInput = z.infer<typeof consumptionInput>;
export type PayoutInput = z.infer<typeof payoutInput>;
export type SettingsInput = z.infer<typeof settingsInput>;
export type WaiverInput = z.infer<typeof waiverInput>;
export type ProductInput = z.infer<typeof productInput>;
export type ProductUpdate = z.infer<typeof productUpdate>;
export type KioskSellInput = z.infer<typeof kioskSellInput>;
export type CounterSellInput = z.infer<typeof counterSellInput>;
export type MonthInput = z.infer<typeof monthInput>;
export type ExpenseInput = z.infer<typeof expenseInput>;
export type EmployeeInput = z.infer<typeof employeeInput>;
export type EmployeeUpdate = z.infer<typeof employeeUpdate>;
export type ShiftInput = z.infer<typeof shiftInput>;
export type PayslipInput = z.infer<typeof payslipInput>;
export type PlanSalesInput = z.infer<typeof planSalesInput>;
