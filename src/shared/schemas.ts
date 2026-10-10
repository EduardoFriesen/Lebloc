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
