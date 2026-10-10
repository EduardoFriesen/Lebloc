import type { PassKind } from '../domain/passes';
import type { SplitRule } from '../domain/sale';
import type { WaiverState, WaiverStatus } from '../domain/waiver';

export type { WaiverState, WaiverStatus };

export type PaymentMethod = 'cash' | 'transfer';

export interface Guardian {
  id: number;
  clientId: number;
  firstName: string;
  lastName: string;
  dni: string | null;
  phone: string | null;
  relation: string | null;
}

export interface Client {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  address: string | null;
  phone: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  emergencyRelation: string | null;
  enrolledAt: string;
  updatedAt: string;
  archivedAt: string | null;
  anonymizedAt: string | null;
  guardians: Guardian[];
}

export interface ClientSummary {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  archivedAt: string | null;
  activeSales: number;
  remainingFree: number;
  remainingTeacher: number;
  debtCents: number;
  /** Days since the oldest sale that still has debt; null when the client owes nothing. */
  debtDays: number | null;
  waiver: WaiverStatus;
}

export interface Social {
  network: string;
  handle: string;
}

export interface TeacherSchedule {
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface Teacher {
  id: number;
  firstName: string;
  lastName: string;
  address: string | null;
  phone: string | null;
  socials: Social[];
  classRateCents: number;
  active: boolean;
  schedules: TeacherSchedule[];
}

export interface Plan {
  id: number;
  name: string;
  freePasses: number;
  teacherPasses: number;
  priceCents: number;
  active: boolean;
}

export interface Sale {
  id: number;
  clientId: number;
  soldAt: string;
  planId: number;
  planName: string;
  freePasses: number;
  teacherPasses: number;
  localPriceCents: number;
  teacherId: number | null;
  teacherName: string | null;
  teacherRateCents: number;
  teacherSurchargeCents: number;
  totalCents: number;
  splitRule: SplitRule;
  voidedAt: string | null;
  paidCents: number;
  debtCents: number;
  remainingFree: number;
  remainingTeacher: number;
}

export interface Payment {
  id: number;
  saleId: number;
  paidAt: string;
  amountCents: number;
  method: PaymentMethod;
  localCents: number;
  teacherCents: number;
  voidedAt: string | null;
}

export interface Consumption {
  id: number;
  saleId: number;
  kind: PassKind;
  consumedAt: string;
  note: string | null;
  voidedAt: string | null;
}

export interface ClientAccount {
  client: Client;
  sales: Sale[];
  payments: Payment[];
  consumptions: Consumption[];
  remainingFree: number;
  remainingTeacher: number;
  debtCents: number;
  lowOnPasses: boolean;
  waivers: WaiverSignature[];
  waiver: WaiverStatus;
}

export interface WaiverSignature {
  id: number;
  clientId: number;
  signedAt: string;
  recordedAt: string;
  voidedAt: string | null;
}

export interface WaiverAlert {
  clientId: number;
  clientName: string;
  state: WaiverState;
  expiresAt: string | null;
}

export interface TeacherPayout {
  id: number;
  teacherId: number;
  paidAt: string;
  amountCents: number;
  method: PaymentMethod;
  note: string | null;
  voidedAt: string | null;
}

export interface TeacherShare {
  paymentId: number;
  saleId: number;
  paidAt: string;
  clientName: string;
  planName: string;
  teacherCents: number;
}

export interface TeacherBalance {
  teacherId: number;
  teacherName: string;
  earnedCents: number;
  paidOutCents: number;
  balanceCents: number;
}

export interface TeacherAccount extends TeacherBalance {
  teacher: Teacher;
  payouts: TeacherPayout[];
  shares: TeacherShare[];
}

export interface Debtor {
  saleId: number;
  clientId: number;
  clientName: string;
  planName: string;
  soldAt: string;
  totalCents: number;
  debtCents: number;
  daysSinceSale: number;
}

export interface LowPassesAlert {
  clientId: number;
  clientName: string;
  remainingFree: number;
  remainingTeacher: number;
}

export interface Dashboard {
  lowPasses: LowPassesAlert[];
  debtors: Debtor[];
  teacherBalances: TeacherBalance[];
  waiverAlerts: WaiverAlert[];
}

export interface Settings {
  lowPassesThreshold: number;
  waiverValidityMonths: number;
}

export type BackupOutcome = { status: 'done'; path: string } | { status: 'cancelled' };
